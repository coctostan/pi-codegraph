---
id: 8
title: Implement indexProject() to index .ts files (exclude node_modules) and
  store hashes/nodes/edges
status: approved
depends_on:
  - 7
no_test: false
files_to_modify:
  - src/indexer/pipeline.ts
files_to_create:
  - test/indexer-index-project.test.ts
---

### Task 8: Implement `indexProject()` to index `.ts` files (exclude node_modules) and store hashes/nodes/edges [depends: 7]

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Create: `test/indexer-index-project.test.ts`

**Step 1 — Write the failing test**
Create `test/indexer-index-project.test.ts`:
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
      expect(nodeCount).toBeGreaterThanOrEqual(4); // 2 module nodes + 2 function nodes

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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-index-project.test.ts`
Expected: FAIL — `SyntaxError: The requested module '../src/indexer/pipeline.js' does not provide an export named 'indexProject'`

**Step 3 — Write minimal implementation**
Replace `src/indexer/pipeline.ts` with:
```ts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { GraphStore } from "../graph/store.js";
import { extractFile, sha256Hex } from "./tree-sitter.js";

export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
}

function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

function walkTsFiles(root: string): string[] {
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules") continue;
      const full = join(dir, ent.name);

      if (ent.isDirectory()) {
        walk(full);
        continue;
      }

      if (ent.isFile() && ent.name.endsWith(".ts")) {
        out.push(full);
      }
    }
  };

  walk(root);
  return out;
}

export function indexProject(projectRoot: string, store: GraphStore): IndexResult {
  const files = walkTsFiles(projectRoot);

  let indexed = 0;
  const skipped = 0;
  const removed = 0;
  let errors = 0;

  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));

    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);

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

  return { indexed, skipped, removed, errors };
}

// Back-compat with the existing placeholder export test
export const IndexPipeline = indexProject;
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-index-project.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
