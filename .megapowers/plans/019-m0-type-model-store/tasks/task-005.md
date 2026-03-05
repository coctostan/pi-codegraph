---
id: 5
title: "SqliteGraphStore edges: addEdge/getNeighbors with direction and kind filters"
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
  - test/graph-store.test.ts
files_to_create: []
---

Implement AC 27–31.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("addEdge + getNeighbors supports in/out/both and kind filters", () => {
  const store = new SqliteGraphStore();

  const n1 = {
    id: "src/a.ts::a:1",
    kind: "function" as const,
    name: "a",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "ha",
  };
  const n2 = {
    id: "src/b.ts::b:2",
    kind: "function" as const,
    name: "b",
    file: "src/b.ts",
    start_line: 2,
    end_line: 2,
    content_hash: "hb",
  };
  const n3 = {
    id: "src/c.ts::c:3",
    kind: "function" as const,
    name: "c",
    file: "src/c.ts",
    start_line: 3,
    end_line: 3,
    content_hash: "hc",
  };

  store.addNode(n1);
  store.addNode(n2);
  store.addNode(n3);

  store.addEdge({
    source: n1.id,
    target: n2.id,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "a() calls b()",
      content_hash: "e1",
    },
    created_at: 1,
  });

  store.addEdge({
    source: n3.id,
    target: n1.id,
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.7,
      evidence: "import { a }",
      content_hash: "e2",
    },
    created_at: 2,
  });

  const out = store.getNeighbors(n1.id, { direction: "out" });
  expect(out).toHaveLength(1);
  expect(out[0]?.node.id).toBe(n2.id);
  expect(out[0]?.edge.kind).toBe("calls");

  const inbound = store.getNeighbors(n1.id, { direction: "in" });
  expect(inbound).toHaveLength(1);
  expect(inbound[0]?.node.id).toBe(n3.id);
  expect(inbound[0]?.edge.kind).toBe("imports");

  const both = store.getNeighbors(n1.id);
  expect(both).toHaveLength(2);

  const importsAnyDirection = store.getNeighbors(n1.id, { kind: "imports" });
  expect(importsAnyDirection).toHaveLength(1);
  expect(importsAnyDirection[0]?.edge.kind).toBe("imports");
  expect(importsAnyDirection[0]?.node.id).toBe(n3.id);

  const importsOnly = store.getNeighbors(n1.id, { direction: "in", kind: "imports" });
  expect(importsOnly).toHaveLength(1);
  expect(importsOnly[0]?.edge.kind).toBe("imports");

  const callsOnlyInbound = store.getNeighbors(n1.id, { direction: "in", kind: "calls" });
  expect(callsOnlyInbound).toHaveLength(0);
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: addEdge`

### Step 3 — Implement full production code for edge methods
In `src/graph/sqlite.ts`, replace `addEdge` and `getNeighbors` with:

```ts
  addEdge(edge: GraphEdge): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO edges
          (source, target, kind, provenance, confidence, evidence, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        edge.source,
        edge.target,
        edge.kind,
        edge.provenance.source,
        edge.provenance.confidence,
        edge.provenance.evidence,
        edge.provenance.content_hash,
        edge.created_at
      );
  }

  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
    const direction = options?.direction ?? "both";
    const kind = options?.kind;
    const results: NeighborResult[] = [];

    if (direction === "out" || direction === "both") {
      const sql = kind
        ? `SELECT
             n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind, e.provenance, e.confidence, e.evidence, e.content_hash as edge_hash, e.created_at
           FROM edges e
           JOIN nodes n ON n.id = e.target
           WHERE e.source = ? AND e.kind = ?`
        : `SELECT
             n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind, e.provenance, e.confidence, e.evidence, e.content_hash as edge_hash, e.created_at
           FROM edges e
           JOIN nodes n ON n.id = e.target
           WHERE e.source = ?`;

      const rows = (kind
        ? this.db.query(sql).all(nodeId, kind)
        : this.db.query(sql).all(nodeId)) as Array<{
        id: string;
        kind: GraphNode["kind"];
        name: string;
        file: string;
        start_line: number;
        end_line: number | null;
        content_hash: string;
        source: string;
        target: string;
        edge_kind: GraphEdge["kind"];
        provenance: GraphEdge["provenance"]["source"];
        confidence: number;
        evidence: string;
        edge_hash: string;
        created_at: number;
      }>;

      for (const row of rows) {
        results.push({
          node: {
            id: row.id,
            kind: row.kind,
            name: row.name,
            file: row.file,
            start_line: row.start_line,
            end_line: row.end_line,
            content_hash: row.content_hash,
          },
          edge: {
            source: row.source,
            target: row.target,
            kind: row.edge_kind,
            provenance: {
              source: row.provenance,
              confidence: row.confidence,
              evidence: row.evidence,
              content_hash: row.edge_hash,
            },
            created_at: row.created_at,
          },
        });
      }
    }

    if (direction === "in" || direction === "both") {
      const sql = kind
        ? `SELECT
             n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind, e.provenance, e.confidence, e.evidence, e.content_hash as edge_hash, e.created_at
           FROM edges e
           JOIN nodes n ON n.id = e.source
           WHERE e.target = ? AND e.kind = ?`
        : `SELECT
             n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind, e.provenance, e.confidence, e.evidence, e.content_hash as edge_hash, e.created_at
           FROM edges e
           JOIN nodes n ON n.id = e.source
           WHERE e.target = ?`;

      const rows = (kind
        ? this.db.query(sql).all(nodeId, kind)
        : this.db.query(sql).all(nodeId)) as Array<{
        id: string;
        kind: GraphNode["kind"];
        name: string;
        file: string;
        start_line: number;
        end_line: number | null;
        content_hash: string;
        source: string;
        target: string;
        edge_kind: GraphEdge["kind"];
        provenance: GraphEdge["provenance"]["source"];
        confidence: number;
        evidence: string;
        edge_hash: string;
        created_at: number;
      }>;

      for (const row of rows) {
        results.push({
          node: {
            id: row.id,
            kind: row.kind,
            name: row.name,
            file: row.file,
            start_line: row.start_line,
            end_line: row.end_line,
            content_hash: row.content_hash,
          },
          edge: {
            source: row.source,
            target: row.target,
            kind: row.edge_kind,
            provenance: {
              source: row.provenance,
              confidence: row.confidence,
              evidence: row.evidence,
              content_hash: row.edge_hash,
            },
            created_at: row.created_at,
          },
        });
      }
    }

    return results;
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for edge/neighbor behavior tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 27, 28, 29, 30, 31
