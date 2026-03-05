---
id: 9
title: "Add incremental hashing: skip unchanged files and delete+reindex changed
  files"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - src/indexer/pipeline.ts
  - test/indexer-index-project.test.ts
files_to_create: []
---

### Task 9: Add incremental hashing: skip unchanged files and delete+reindex changed files [depends: 8]

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Modify: `test/indexer-index-project.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-index-project.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

test("indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes", () => {
  const root = join(tmpdir(), `pi-codegraph-index-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });

  const aContent = [
    'import { x } from "./b";',
    "export function a() {",
    "  x();",
    "}",
  ].join("\n");

  const bContent = ["export function x() {}"].join("\n");
  const ignoredContent = "export function ignored() {}";

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(join(root, "node_modules", "pkg", "ignored.ts"), ignoredContent);

  const store = new SqliteGraphStore(dbPath);
  try {
    const result = indexProject(root, store);

    expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file, hash FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string; hash: string }>;

      expect(fileRows).toEqual([
        { file: "src/a.ts", hash: sha256Hex(aContent) },
        { file: "src/b.ts", hash: sha256Hex(bContent) },
      ]);

      const nodeCount = (db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number }).c;
      expect(nodeCount).toBeGreaterThanOrEqual(4);

      const edgeKinds = db
        .query("SELECT kind FROM edges ORDER BY kind ASC")
        .all() as Array<{ kind: string }>;
      expect(edgeKinds.map((r) => r.kind)).toEqual(["calls", "imports"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject skips unchanged files and delete+reindexes changed files", () => {
  const root = join(tmpdir(), `pi-codegraph-incremental-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });

  const aV1 = [
    "export function a() {",
    "  return 1;",
    "}",
  ].join("\n");

  const bV1 = "export function b() {}";

  writeFileSync(join(root, "src", "a.ts"), aV1);
  writeFileSync(join(root, "src", "b.ts"), bV1);

  const store = new SqliteGraphStore(dbPath);
  try {
    expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    // Second run with no changes should skip everything
    expect(indexProject(root, store)).toEqual({ indexed: 0, skipped: 2, removed: 0, errors: 0 });

    // Change one file
    const aV2 = [
      "export function a2() {",
      "  return 2;",
      "}",
    ].join("\n");
    writeFileSync(join(root, "src", "a.ts"), aV2);

    expect(indexProject(root, store)).toEqual({ indexed: 1, skipped: 1, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const aRow = db
        .query("SELECT hash FROM file_hashes WHERE file = 'src/a.ts'")
        .get() as { hash: string };
      expect(aRow.hash).toBe(sha256Hex(aV2));

      const fnNames = db
        .query("SELECT name FROM nodes WHERE file = 'src/a.ts' AND kind = 'function' ORDER BY name")
        .all() as Array<{ name: string }>;

      // Proves delete-then-insert happened: old node `a` should be gone
      expect(fnNames.map((r) => r.name)).toEqual(["a2"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — the second run assertion should fail because `indexProject` currently re-indexes everything (expected `{ indexed: 0, skipped: 2, ... }`).

**Step 3 — Write minimal implementation**
Update `src/indexer/pipeline.ts` so it:
- compares `store.getFileHash(rel)` with the new hash
- skips unchanged files
- calls `store.deleteFile(rel)` before re-indexing a changed file

Replace the loop body with:
```ts
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));

    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);

      const existing = store.getFileHash(rel);
      if (existing === hash) {
        skipped++;
        continue;
      }

      if (existing !== null) {
        store.deleteFile(rel);
      }

      const extracted = extractFile(rel, content);

      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);

      store.setFileHash(rel, hash);
      indexed++;
    } catch {
      errors++;
    }
  }
```

Also change the initial counters in `indexProject` to be mutable:
```ts
  let indexed = 0;
  let skipped = 0;
  const removed = 0;
  let errors = 0;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 —Verify no regressions**
Run: `bun test`
Expected: all passing
