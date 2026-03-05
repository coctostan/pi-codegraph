---
id: 1
title: findNodes returns all nodes matching a name
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/store.ts
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-find-nodes.test.ts
---

**Spec criteria:** 1, 2, 4

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-find-nodes.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/graph-store-find-nodes.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("findNodes returns all nodes matching a name across files", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  store.addNode({
    id: "src/b.ts::foo:5",
    kind: "function",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
  });

  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h3",
  });

  const results = store.findNodes("foo");
  expect(results).toHaveLength(2);
  expect(results.map((n) => n.id).sort()).toEqual([
    "src/a.ts::foo:1",
    "src/b.ts::foo:5",
  ]);

  store.close();
});

test("findNodes returns empty array for nonexistent name", () => {
  const store = new SqliteGraphStore();
  const results = store.findNodes("nonexistent");
  expect(results).toEqual([]);
  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: FAIL — TypeError: store.findNodes is not a function

**Step 3 — Write minimal implementation**

In `src/graph/store.ts`, add `findNodes` to the `GraphStore` interface:

```typescript
import type { EdgeKind, GraphEdge, GraphNode } from "./types.js";

export interface NeighborOptions {
  kind?: EdgeKind;
  direction?: "in" | "out" | "both";
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  findNodes(name: string, file?: string): GraphNode[];
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;
  listFiles(): string[];
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  close(): void;
}
```

In `src/graph/sqlite.ts`, add the `findNodes` method to `SqliteGraphStore`:

```typescript
findNodes(name: string, file?: string): GraphNode[] {
  const sql = file
    ? `SELECT id, kind, name, file, start_line, end_line, content_hash
       FROM nodes WHERE name = ? AND file = ?`
    : `SELECT id, kind, name, file, start_line, end_line, content_hash
       FROM nodes WHERE name = ?`;

  const rows = (file
    ? this.db.query(sql).all(name, file)
    : this.db.query(sql).all(name)) as Array<{
    id: string;
    kind: GraphNode["kind"];
    name: string;
    file: string;
    start_line: number;
    end_line: number | null;
    content_hash: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    file: row.file,
    start_line: row.start_line,
    end_line: row.end_line,
    content_hash: row.content_hash,
  }));
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-find-nodes.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
