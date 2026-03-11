---
id: 6
title: getStatistics method on GraphStore interface and SQLite implementation
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/graph/store.ts
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-statistics.test.ts
---

**AC:** 17 (index statistics)

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-statistics.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-statistics.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";
import type { GraphNode, GraphEdge } from "../src/graph/types.js";

function makeNode(file: string, name: string, kind: GraphNode["kind"], line: number): GraphNode {
  return { id: nodeId(file, name, line), kind, name, file, start_line: line, end_line: line, content_hash: "abc123" };
}

function makeEdge(source: string, target: string, kind: GraphEdge["kind"], provSource: GraphEdge["provenance"]["source"]): GraphEdge {
  return {
    source,
    target,
    kind,
    provenance: { source: provSource, confidence: 0.5, evidence: "test", content_hash: "abc123" },
    created_at: Date.now(),
  };
}

test("getStatistics returns node counts grouped by kind", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode(makeNode("a.ts", "a.ts", "module", 1));
    store.addNode(makeNode("a.ts", "foo", "function", 2));
    store.addNode(makeNode("a.ts", "Bar", "class", 5));
    store.addNode(makeNode("b.ts", "b.ts", "module", 1));

    const stats = store.getStatistics();

    expect(stats.nodes.module).toBe(2);
    expect(stats.nodes.function).toBe(1);
    expect(stats.nodes.class).toBe(1);
  } finally {
    store.close();
  }
});

test("getStatistics returns edge counts grouped by kind and provenance source", () => {
  const store = new SqliteGraphStore();
  try {
    const modA = makeNode("a.ts", "a.ts", "module", 1);
    const modB = makeNode("b.ts", "b.ts", "module", 1);
    const fn = makeNode("a.ts", "foo", "function", 2);
    store.addNode(modA);
    store.addNode(modB);
    store.addNode(fn);

    store.addEdge(makeEdge(modA.id, "__unresolved__::x:0", "imports", "tree-sitter"));
    store.addEdge(makeEdge(fn.id, "__unresolved__::bar:0", "calls", "tree-sitter"));
    store.addEdge(makeEdge(fn.id, modB.id, "calls", "lsp"));

    const stats = store.getStatistics();

    expect(stats.edges["imports"]["tree-sitter"]).toBe(1);
    expect(stats.edges["calls"]["tree-sitter"]).toBe(1);
    expect(stats.edges["calls"]["lsp"]).toBe(1);
  } finally {
    store.close();
  }
});

test("getStatistics returns file counts (total tracked)", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode(makeNode("a.ts", "a.ts", "module", 1));
    store.addNode(makeNode("b.ts", "b.ts", "module", 1));
    store.setFileHash("a.ts", "hash1");
    store.setFileHash("b.ts", "hash2");

    const stats = store.getStatistics();

    expect(stats.files.total).toBe(2);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-statistics.test.ts`
Expected: FAIL — `TypeError: store.getStatistics is not a function`

**Step 3 — Write minimal implementation**

First, add the interface to `src/graph/store.ts`:

```ts
// Add before the GraphStore interface closing brace (before line 42):
export interface GraphStatistics {
  nodes: Record<string, number>;
  edges: Record<string, Record<string, number>>;
  files: { total: number; stale: number };
}
```

Add `getStatistics` to the `GraphStore` interface:

```ts
  getStatistics(projectRoot?: string): GraphStatistics;
```

Then implement in `src/graph/sqlite.ts`:

```ts
// Import GraphStatistics:
import type { GraphStore, GraphStatistics, NeighborOptions, NeighborResult, TestTraceRecord, TestTraceStep } from "./store.js";

// Add method to SqliteGraphStore class:
  getStatistics(_projectRoot?: string): GraphStatistics {
    const nodeRows = this.db.prepare("SELECT kind, COUNT(*) as cnt FROM nodes GROUP BY kind").all() as Array<{ kind: string; cnt: number }>;
    const nodes: Record<string, number> = {};
    for (const row of nodeRows) nodes[row.kind] = row.cnt;

    const edgeRows = this.db.prepare("SELECT kind, provenance_source, COUNT(*) as cnt FROM edges GROUP BY kind, provenance_source").all() as Array<{ kind: string; provenance_source: string; cnt: number }>;
    const edges: Record<string, Record<string, number>> = {};
    for (const row of edgeRows) {
      if (!edges[row.kind]) edges[row.kind] = {};
      edges[row.kind][row.provenance_source] = row.cnt;
    }

    const fileCountRow = this.db.prepare("SELECT COUNT(*) as cnt FROM file_hashes").get() as { cnt: number };

    return {
      nodes,
      edges,
      files: { total: fileCountRow.cnt, stale: 0 },
    };
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-statistics.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing
