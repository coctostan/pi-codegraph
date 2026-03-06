---
id: 3
title: Extend GraphStore with unresolved-edge queries and targeted edge deletion
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/store.ts
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

### Task 3: Extend `GraphStore` with unresolved-edge queries and targeted edge deletion
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Modify: `test/graph-store.test.ts`

Append tests for `getUnresolvedEdges()`, `getEdgesBySource()` (ordered by `created_at` ASC),
and `deleteEdge()`, then implement each method in the interface and SQLite backend.

---

#### Step 1 — Test (RED)

Append to `test/graph-store.test.ts`:

```typescript
// ---------- Task 3 additions ----------

test("getUnresolvedEdges returns only edges whose target starts with __unresolved__::", () => {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::caller:1",
    kind: "function" as const,
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  };
  const resolved = {
    id: "src/b.ts::helper:1",
    kind: "function" as const,
    name: "helper",
    file: "src/b.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h2",
  };
  store.addNode(caller);
  store.addNode(resolved);

  store.addEdge({
    source: caller.id,
    target: resolved.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "helper:1:5", content_hash: "h1" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::helper:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "helper:2:5", content_hash: "h1" },
    created_at: 2000,
  });

  const unresolved = store.getUnresolvedEdges();
  expect(unresolved).toHaveLength(1);
  expect(unresolved[0]!.target).toBe("__unresolved__::helper:0");

  store.close();
});

test("getEdgesBySource returns all edges for a source ordered by created_at ASC", () => {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::fn:1",
    kind: "function" as const,
    name: "fn",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "h",
  };
  store.addNode(caller);

  // Insert in reverse order to confirm ORDER BY created_at ASC is enforced.
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::second:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second:3:5", content_hash: "h" },
    created_at: 2000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::first:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first:2:5", content_hash: "h" },
    created_at: 1000,
  });

  const edges = store.getEdgesBySource(caller.id);
  expect(edges).toHaveLength(2);
  // Must be in created_at ASC order regardless of insertion order.
  expect(edges[0]!.created_at).toBe(1000);
  expect(edges[1]!.created_at).toBe(2000);

  store.close();
});

test("deleteEdge removes only the matching (source, target, kind, provenanceSource) row", () => {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::deltest:1",
    kind: "function" as const,
    name: "deltest",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h",
  };
  store.addNode(caller);

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::foo:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "foo:2:5", content_hash: "h" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::bar:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "bar:3:5", content_hash: "h" },
    created_at: 2000,
  });

  store.deleteEdge(caller.id, "__unresolved__::foo:0", "calls", "tree-sitter");

  const remaining = store.getEdgesBySource(caller.id);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]!.target).toBe("__unresolved__::bar:0");

  store.close();
});
```

---

#### Step 2 — Run (FAIL)

```
bun test test/graph-store.test.ts
```

Expected failure — methods do not exist yet:
```
TypeError: store.getUnresolvedEdges is not a function
```

---

#### Step 3 — Implementation

**In `src/graph/store.ts`**, add three new signatures to the `GraphStore` interface:

```typescript
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
  /** Returns all edges whose target begins with "__unresolved__::". */
  getUnresolvedEdges(): GraphEdge[];
  /** Returns all edges whose source equals sourceId, ordered by created_at ASC. */
  getEdgesBySource(sourceId: string): GraphEdge[];
  /** Deletes the single edge identified by (source, target, kind, provenanceSource). */
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  close(): void;
}
```

**In `src/graph/sqlite.ts`**, add a private static row-to-edge helper and three public
methods. Insert before the `getNodesByFile` method:

```typescript
  private static edgeFromRow(row: {
    source: string;
    target: string;
    kind: string;
    provenance_source: string;
    confidence: number;
    evidence: string;
    content_hash: string;
    created_at: number;
  }): GraphEdge {
    return {
      source: row.source,
      target: row.target,
      kind: row.kind as GraphEdge["kind"],
      provenance: {
        source: row.provenance_source as GraphEdge["provenance"]["source"],
        confidence: row.confidence,
        evidence: row.evidence,
        content_hash: row.content_hash,
      },
      created_at: row.created_at,
    };
  }

  getUnresolvedEdges(): GraphEdge[] {
    // Use SUBSTR to avoid SQL LIKE treating '_' as a single-char wildcard.
    const rows = this.db
      .query(
        `SELECT source, target, kind, provenance_source, confidence, evidence,
                content_hash, created_at
         FROM edges
         WHERE SUBSTR(target, 1, 16) = '__unresolved__::'
         ORDER BY created_at ASC`,
      )
      .all() as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  getEdgesBySource(sourceId: string): GraphEdge[] {
    const rows = this.db
      .query(
        `SELECT source, target, kind, provenance_source, confidence, evidence,
                content_hash, created_at
         FROM edges
         WHERE source = ?
         ORDER BY created_at ASC`,
      )
      .all(sourceId) as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  deleteEdge(
    source: string,
    target: string,
    kind: string,
    provenanceSource: string,
  ): void {
    this.db
      .query(
        `DELETE FROM edges
         WHERE source = ? AND target = ? AND kind = ? AND provenance_source = ?`,
      )
      .run(source, target, kind, provenanceSource);
  }
```

---

#### Step 4 — Run (PASS)

```
bun test test/graph-store.test.ts
```

Expected: all tests in the file pass.

---

#### Step 5 — Full suite

```
bun test
```

Expected: all tests pass (no regressions).
