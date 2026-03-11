---
id: 7
title: Staleness detection in getStatistics
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-staleness.test.ts
---

**AC:** 18 (staleness detection)

**Files:**
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-staleness.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-staleness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { nodeId } from "../src/graph/types.js";

test("getStatistics reports stale files when content hash no longer matches disk", () => {
  const root = join(tmpdir(), `pi-codegraph-stale-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  const originalContent = "export function foo() {}";
  writeFileSync(join(root, "src", "a.ts"), originalContent);
  writeFileSync(join(root, "src", "b.ts"), "export function bar() {}");

  const store = new SqliteGraphStore();
  try {
    // Simulate indexing: set file hashes to match current content
    store.setFileHash("src/a.ts", sha256Hex(originalContent));
    store.setFileHash("src/b.ts", sha256Hex("export function bar() {}"));
    store.addNode({
      id: nodeId("src/a.ts", "src/a.ts", 1), kind: "module", name: "src/a.ts",
      file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(originalContent),
    });
    store.addNode({
      id: nodeId("src/b.ts", "src/b.ts", 1), kind: "module", name: "src/b.ts",
      file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex("export function bar() {}"),
    });

    // Before modification: no stale files
    const statsBefore = store.getStatistics(root);
    expect(statsBefore.files.stale).toBe(0);
    expect(statsBefore.files.total).toBe(2);

    // Modify a.ts on disk
    writeFileSync(join(root, "src", "a.ts"), "export function foo() { return 42; }");

    // After modification: 1 stale file
    const statsAfter = store.getStatistics(root);
    expect(statsAfter.files.stale).toBe(1);
    expect(statsAfter.files.total).toBe(2);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("getStatistics reports 0 stale when no projectRoot provided", () => {
  const store = new SqliteGraphStore();
  try {
    store.setFileHash("src/a.ts", "somehash");
    const stats = store.getStatistics();
    expect(stats.files.stale).toBe(0);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-staleness.test.ts`
Expected: FAIL — `expect(received).toBe(expected) // Expected: 1, Received: 0` because the current `getStatistics` always returns `stale: 0`.

**Step 3 — Write minimal implementation**

In `src/graph/sqlite.ts`, update the `getStatistics` method to compute staleness when `projectRoot` is provided:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
// (add to existing imports from node:module)

// Update getStatistics:
  getStatistics(projectRoot?: string): GraphStatistics {
    const nodeRows = this.db.prepare("SELECT kind, COUNT(*) as cnt FROM nodes GROUP BY kind").all() as Array<{ kind: string; cnt: number }>;
    const nodes: Record<string, number> = {};
    for (const row of nodeRows) nodes[row.kind] = row.cnt;

    const edgeRows = this.db.prepare("SELECT kind, provenance_source, COUNT(*) as cnt FROM edges GROUP BY kind, provenance_source").all() as Array<{ kind: string; provenance_source: string; cnt: number }>;
    const edges: Record<string, Record<string, number>> = {};
    for (const row of edgeRows) {
      if (!edges[row.kind]) edges[row.kind] = {};
      edges[row.kind][row.provenance_source] = row.cnt;
    }

    const fileRows = this.db.prepare("SELECT file, hash FROM file_hashes").all() as Array<{ file: string; hash: string }>;
    const total = fileRows.length;

    let stale = 0;
    if (projectRoot) {
      for (const row of fileRows) {
        try {
          const content = readFileSync(join(projectRoot, row.file), "utf8");
          const currentHash = createHash("sha256").update(content).digest("hex");
          if (currentHash !== row.hash) stale++;
        } catch {
          stale++; // File missing or unreadable = stale
        }
      }
    }

    return { nodes, edges, files: { total, stale } };
  }
```

Also add the `createHash` import at the top of `sqlite.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-staleness.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
