---
id: 10
title: Handle deleted files (removed count) and continue indexing when a file
  read fails
status: approved
depends_on:
  - 9
no_test: false
files_to_modify:
  - src/indexer/pipeline.ts
  - test/indexer-index-project.test.ts
files_to_create: []
---

### Task 10: Handle deleted files (`removed` count) and continue indexing when a file read fails [depends: 9]

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Modify: `test/indexer-index-project.test.ts`

**Step 1 — Write the failing test**
Replace `test/indexer-index-project.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

test("indexProject deletes missing files and continues when a file cannot be read", () => {
  const root = join(tmpdir(), `pi-codegraph-removed-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });

  const aContent = "export function a() {}";
  const bContent = "export function b() {}";
  const unreadablePath = join(root, "src", "unreadable.ts");

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(unreadablePath, "export function nope() {}");

  // Make unreadable to force readFileSync failure
  chmodSync(unreadablePath, 0o000);

  const store = new SqliteGraphStore(dbPath);
  try {
    expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });

    // Remove a previously indexed file
    rmSync(join(root, "src", "b.ts"), { force: true });

    expect(indexProject(root, store)).toEqual({ indexed: 0, skipped: 1, removed: 1, errors: 1 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string }>;

      // b.ts removed; unreadable.ts never indexed successfully
      expect(fileRows.map((r) => r.file)).toEqual(["src/a.ts"]);
    } finally {
      db.close();
    }
  } finally {
    // Restore permissions so cleanup works reliably
    try {
      chmodSync(unreadablePath, 0o644);
    } catch {
      // ignore
    }

    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — the second test should fail because `indexProject` currently never reports `removed: 1` when a previously indexed file disappears.

**Step 3 — Write minimal implementation**
Update `src/indexer/pipeline.ts` to delete files that were previously indexed but no longer exist on disk.

1) Make `removed` mutable:
```ts
  let removed = 0;
```

2) Build the set of current relative file paths:
```ts
  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
```

3) After the per-file indexing loop, delete missing files:
```ts
  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile)) continue;
    try {
      store.deleteFile(oldFile);
      removed++;
    } catch {
      errors++;
    }
  }
```

4) Return the updated `removed` value.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
