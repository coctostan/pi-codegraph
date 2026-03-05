---
id: 7
title: Add GraphStore.listFiles() for deletion detection in the indexer
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/graph/store.ts
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-list-files.test.ts
---

### Task 7: Add `GraphStore.listFiles()` for deletion detection in the indexer [depends: 6]

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Create: `test/graph-store-list-files.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-store-list-files.test.ts`:
```ts
import { expect, test } from "bun:test";

import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.listFiles returns indexed files and reflects deleteFile", () => {
  const store = new SqliteGraphStore();

  store.setFileHash("src/a.ts", "ha");
  store.setFileHash("src/b.ts", "hb");

  expect(store.listFiles()).toEqual(["src/a.ts", "src/b.ts"]);

  store.deleteFile("src/a.ts");
  expect(store.listFiles()).toEqual(["src/b.ts"]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-list-files.test.ts`
Expected: FAIL — TypeScript compile error like:
`Property 'listFiles' does not exist on type 'SqliteGraphStore'.`

**Step 3 — Write minimal implementation**
1) Update `src/graph/store.ts` to add `listFiles()` to the interface:
```ts
export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;

  // NEW: list all files currently tracked by file hashes
  listFiles(): string[];

  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  close(): void;
}
```

2) Implement it in `src/graph/sqlite.ts` (add near the other file-hash methods):
```ts
  listFiles(): string[] {
    const rows = this.db
      .query("SELECT file FROM file_hashes ORDER BY file ASC")
      .all() as Array<{ file: string }>;

    return rows.map((r) => r.file);
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-list-files.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
