# Plan

### Task 1: Type model: define unions/interfaces and nodeId helper

Implement AC 1–10 with explicit 5-step compile-time TDD.

### Step 1 — Add full typecheck test code (RED setup)
Update `test/graph-types.typecheck.ts` to this exact content:

```ts
import type { GraphEdge, GraphNode, Provenance } from "../src/graph/types.js";
import { nodeId } from "../src/graph/types.js";

const validNode: GraphNode = {
  id: "src/a.ts::foo:10",
  kind: "function",
  name: "foo",
  file: "src/a.ts",
  start_line: 10,
  end_line: 20,
  content_hash: "hash-node",
};

const validEdge: GraphEdge = {
  source: "src/a.ts::foo:10",
  target: "src/b.ts::bar:3",
  kind: "calls",
  provenance: {
    source: "tree-sitter",
    confidence: 0.8,
    evidence: "foo() calls bar()",
    content_hash: "hash-edge",
  },
  created_at: 1700000000,
};

const validProvenance: Provenance = {
  source: "lsp",
  confidence: 1,
  evidence: "go-to-definition",
  content_hash: "hash-prov",
};

const id = nodeId("src/a.ts", "foo", 10);
if (id !== "src/a.ts::foo:10") {
  throw new Error(`unexpected nodeId: ${id}`);
}

// @ts-expect-error invalid NodeKind must be rejected
const invalidNodeKind: GraphNode = { ...validNode, kind: "not-a-kind" };

// @ts-expect-error invalid EdgeKind must be rejected
const invalidEdgeKind: GraphEdge = { ...validEdge, kind: "not-a-kind" };

// @ts-expect-error invalid ProvenanceSource must be rejected
const invalidProvSource: Provenance = { ...validProvenance, source: "not-a-kind" };

void [
  validNode,
  validEdge,
  validProvenance,
  invalidNodeKind,
  invalidEdgeKind,
  invalidProvSource,
];
export {};
```

### Step 2 — Run typecheck and expect RED
Command:
```bash
bun run check
```
Expected failure contains at least:
- `Object literal may only specify known properties, and 'start_line' does not exist in type 'GraphNode'.`

### Step 3 — Implement full production code
Replace `src/graph/types.ts` with:

```ts
export type NodeKind =
  | "function"
  | "class"
  | "interface"
  | "module"
  | "endpoint"
  | "test";

export type EdgeKind =
  | "calls"
  | "imports"
  | "implements"
  | "extends"
  | "tested_by"
  | "co_changes_with"
  | "renders"
  | "routes_to";

export type ProvenanceSource =
  | "tree-sitter"
  | "lsp"
  | "ast-grep"
  | "coverage"
  | "git"
  | "agent";

export interface Provenance {
  source: ProvenanceSource;
  confidence: number;
  evidence: string;
  content_hash: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  provenance: Provenance;
  created_at: number;
}

export function nodeId(file: string, name: string, startLine: number): string {
  return `${file}::${name}:${startLine}`;
}
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun run check
```
Expected: PASS (exit code 0)

### Step 5 — Run full suite
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 1–10

### Task 2: GraphStore contract: NeighborOptions, NeighborResult, and method signatures [depends: 1]

Implement AC 11–21 with explicit compile-time TDD.

### Step 1 — Add full compile-time contract tests (RED setup)
Append this block to `test/graph-types.typecheck.ts`:

```ts
import type { GraphStore } from "../src/graph/store.js";

const validStore: GraphStore = {
  addNode: () => {},
  addEdge: () => {},
  getNode: () => null,
  getNeighbors: () => [],
  getNodesByFile: () => [],
  deleteFile: () => {},
  getFileHash: () => null,
  setFileHash: () => {},
  close: () => {},
};

// @ts-expect-error GraphStore must require all 9 methods
const invalidStore: GraphStore = {};

void [validStore, invalidStore];
```

### Step 2 — Run typecheck and expect RED
Command:
```bash
bun run check
```
Expected failure contains:
- `Unused '@ts-expect-error' directive.`

### Step 3 — Implement full production code
Replace `src/graph/store.ts` with:

```ts
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
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  close(): void;
}
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun run check
```
Expected: PASS (exit code 0)

### Step 5 — Run full suite
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 11–21

### Task 3: SqliteGraphStore bootstrap: constructor default, schema init, and schema_version [depends: 2]

Implement AC 22, 23, and 43.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore constructor accepts default dbPath", () => {
  expect(() => new SqliteGraphStore()).not.toThrow();
});

test("SqliteGraphStore initializes schema_version=1", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `schema-${Date.now()}.sqlite`);
  try {
    new SqliteGraphStore(dbPath);
    const db = new Database(dbPath);
    const rows = db.query("SELECT version FROM schema_version").all() as Array<{ version: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);
    db.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

Append this compile-time assertion to `test/graph-types.typecheck.ts`:

```ts
import type { GraphStore as GraphStoreContract } from "../src/graph/store.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
const sqliteAsStore: GraphStoreContract = new SqliteGraphStore();
void sqliteAsStore;
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `no such table: schema_version`

### Step 3 — Implement full production code for bootstrap
Replace `src/graph/sqlite.ts` with:

```ts
import { Database } from "bun:sqlite";

import type { GraphStore, NeighborOptions, NeighborResult } from "./store.js";
import type { GraphEdge, GraphNode } from "./types.js";

export class SqliteGraphStore implements GraphStore {
  private db: Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        file TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER,
        content_hash TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS edges (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        kind TEXT NOT NULL,
        provenance TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance)
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        file TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    `);

    const existing = this.db
      .query("SELECT version FROM schema_version LIMIT 1")
      .get() as { version: number } | null;

    if (!existing) {
      this.db.query("INSERT INTO schema_version(version) VALUES (1)").run();
    }
  }

  addNode(_node: GraphNode): void {
    throw new Error("Not implemented: addNode");
  }

  addEdge(_edge: GraphEdge): void {
    throw new Error("Not implemented: addEdge");
  }

  getNode(_id: string): GraphNode | null {
    throw new Error("Not implemented: getNode");
  }

  getNeighbors(_nodeId: string, _options?: NeighborOptions): NeighborResult[] {
    throw new Error("Not implemented: getNeighbors");
  }

  getNodesByFile(_file: string): GraphNode[] {
    throw new Error("Not implemented: getNodesByFile");
  }

  deleteFile(_file: string): void {
    throw new Error("Not implemented: deleteFile");
  }

  getFileHash(_file: string): string | null {
    throw new Error("Not implemented: getFileHash");
  }

  setFileHash(_file: string, _hash: string): void {
    throw new Error("Not implemented: setFileHash");
  }

  close(): void {
    throw new Error("Not implemented: close");
  }
}
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for the constructor/schema tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing (including `SqliteGraphStore` assignable to `GraphStore`).

**Acceptance criteria covered:** 22, 23, 43

### Task 4: SqliteGraphStore nodes: addNode/getNode with upsert semantics [depends: 3]

Implement AC 24–26.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("addNode + getNode round-trip, upsert, and unknown returns null", () => {
  const store = new SqliteGraphStore();

  const original = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  };

  store.addNode(original);
  expect(store.getNode(original.id)).toEqual(original);

  const updated = { ...original, end_line: 4, content_hash: "h2" };
  store.addNode(updated);
  expect(store.getNode(original.id)).toEqual(updated);

  expect(store.getNode("src/a.ts::missing:99")).toBeNull();
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: addNode`

### Step 3 — Implement full production code for node methods
In `src/graph/sqlite.ts`, replace `addNode` and `getNode` with:

```ts
  addNode(node: GraphNode): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO nodes
          (id, kind, name, file, start_line, end_line, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        node.id,
        node.kind,
        node.name,
        node.file,
        node.start_line,
        node.end_line,
        node.content_hash
      );
  }

  getNode(id: string): GraphNode | null {
    const row = this.db
      .query(
        `SELECT id, kind, name, file, start_line, end_line, content_hash
         FROM nodes
         WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          kind: GraphNode["kind"];
          name: string;
          file: string;
          start_line: number;
          end_line: number | null;
          content_hash: string;
        }
      | null;

    if (!row) return null;

    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      file: row.file,
      start_line: row.start_line,
      end_line: row.end_line,
      content_hash: row.content_hash,
    };
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for node behavior tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 24, 25, 26

### Task 5: SqliteGraphStore edges: addEdge/getNeighbors with direction and kind filters [depends: 4]

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

### Task 6: SqliteGraphStore file query: getNodesByFile [depends: 5]

Implement AC 32–33.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("getNodesByFile returns matching nodes and [] for missing files", () => {
  const store = new SqliteGraphStore();

  const n1 = {
    id: "src/a.ts::foo:1",
    kind: "function" as const,
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h1",
  };
  const n2 = {
    id: "src/a.ts::bar:10",
    kind: "function" as const,
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h2",
  };
  const n3 = {
    id: "src/b.ts::baz:5",
    kind: "function" as const,
    name: "baz",
    file: "src/b.ts",
    start_line: 5,
    end_line: 6,
    content_hash: "h3",
  };

  store.addNode(n1);
  store.addNode(n2);
  store.addNode(n3);

  const fromA = store.getNodesByFile("src/a.ts");
  expect(fromA).toHaveLength(2);
  expect(fromA.map((n) => n.id).sort()).toEqual([n1.id, n2.id].sort());

  expect(store.getNodesByFile("src/missing.ts")).toEqual([]);
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: getNodesByFile`

### Step 3 — Implement full production code for file query
In `src/graph/sqlite.ts`, replace `getNodesByFile` with:

```ts
  getNodesByFile(file: string): GraphNode[] {
    const rows = this.db
      .query(
        `SELECT id, kind, name, file, start_line, end_line, content_hash
         FROM nodes
         WHERE file = ?
         ORDER BY start_line ASC, id ASC`
      )
      .all(file) as Array<{
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

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for `getNodesByFile` behavior tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 32, 33

### Task 7: SqliteGraphStore invalidation: deleteFile removes file nodes and touching edges [depends: 6]

Implement AC 34–38.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("deleteFile removes file nodes and all touching edges, preserves unrelated data", () => {
  const store = new SqliteGraphStore();

  const a = {
    id: "src/a.ts::a:1",
    kind: "function" as const,
    name: "a",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "ha",
  };
  const b = {
    id: "src/b.ts::b:1",
    kind: "function" as const,
    name: "b",
    file: "src/b.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "hb",
  };
  const c = {
    id: "src/c.ts::c:1",
    kind: "function" as const,
    name: "c",
    file: "src/c.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "hc",
  };

  store.addNode(a);
  store.addNode(b);
  store.addNode(c);

  // source in src/a.ts
  store.addEdge({
    source: a.id,
    target: b.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "a->b", content_hash: "e1" },
    created_at: 1,
  });

  // target in src/a.ts (incoming cross-file)
  store.addEdge({
    source: c.id,
    target: a.id,
    kind: "imports",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "c->a", content_hash: "e2" },
    created_at: 2,
  });

  // unrelated edge (must survive)
  store.addEdge({
    source: b.id,
    target: c.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 1, evidence: "b->c", content_hash: "e3" },
    created_at: 3,
  });

  store.deleteFile("src/a.ts");

  expect(store.getNodesByFile("src/a.ts")).toEqual([]);

  // edge where source was in src/a.ts is removed
  expect(store.getNeighbors(a.id, { direction: "out" })).toEqual([]);

  // edge where target was in src/a.ts is removed
  expect(store.getNeighbors(a.id, { direction: "in" })).toEqual([]);

  // nodes in other files remain
  expect(store.getNodesByFile("src/b.ts")).toHaveLength(1);
  expect(store.getNodesByFile("src/c.ts")).toHaveLength(1);

  // unrelated edge remains
  const bOut = store.getNeighbors(b.id, { direction: "out" });
  expect(bOut).toHaveLength(1);
  expect(bOut[0]?.node.id).toBe(c.id);
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: deleteFile`

### Step 3 — Implement full production code for invalidation
In `src/graph/sqlite.ts`, replace `deleteFile` with:

```ts
  deleteFile(file: string): void {
    this.db.exec("BEGIN");

    try {
      // 1) delete edges touching nodes from the file (source OR target)
      this.db
        .query(
          `DELETE FROM edges
           WHERE source IN (SELECT id FROM nodes WHERE file = ?)
              OR target IN (SELECT id FROM nodes WHERE file = ?)`
        )
        .run(file, file);

      // 2) delete nodes from the file
      this.db.query(`DELETE FROM nodes WHERE file = ?`).run(file);

      // 3) delete file hash row
      this.db.query(`DELETE FROM file_hashes WHERE file = ?`).run(file);

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for deleteFile invalidation tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 34, 35, 36, 37, 38

### Task 8: SqliteGraphStore file hash API: getFileHash/setFileHash [depends: 7]

Implement AC 39–41.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("getFileHash returns null initially; setFileHash round-trips and overwrites", () => {
  const store = new SqliteGraphStore();

  expect(store.getFileHash("src/a.ts")).toBeNull();

  store.setFileHash("src/a.ts", "abc123");
  expect(store.getFileHash("src/a.ts")).toBe("abc123");

  store.setFileHash("src/a.ts", "def456");
  expect(store.getFileHash("src/a.ts")).toBe("def456");
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: getFileHash`

### Step 3 — Implement full production code for file hashes
In `src/graph/sqlite.ts`, replace `getFileHash` and `setFileHash` with:

```ts
  getFileHash(file: string): string | null {
    const row = this.db
      .query(`SELECT hash FROM file_hashes WHERE file = ?`)
      .get(file) as { hash: string } | null;

    return row?.hash ?? null;
  }

  setFileHash(file: string, hash: string): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO file_hashes (file, hash, indexed_at)
         VALUES (?, ?, ?)`
      )
      .run(file, hash, Date.now());
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for file hash tests.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 39, 40, 41

### Task 9: SqliteGraphStore lifecycle: close() and reopen persistence [depends: 8]

Implement AC 42.

### Step 1 — Add full test code (RED setup)
Append this test block to `test/graph-store.test.ts`:

```ts
test("data persists after close() and reopen with same db path", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `persist-${Date.now()}.sqlite`);

  try {
    const n1 = {
      id: "src/persist.ts::keep:1",
      kind: "function" as const,
      name: "keep",
      file: "src/persist.ts",
      start_line: 1,
      end_line: 2,
      content_hash: "persist-hash",
    };

    const store1 = new SqliteGraphStore(dbPath);
    store1.addNode(n1);
    store1.close();

    const store2 = new SqliteGraphStore(dbPath);
    expect(store2.getNode(n1.id)).toEqual(n1);
    store2.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
```

### Step 2 — Run focused tests and expect RED
Command:
```bash
bun test test/graph-store.test.ts
```
Expected failure contains:
- `Not implemented: close`

### Step 3 — Implement full production code for close
In `src/graph/sqlite.ts`, replace `close` with:

```ts
  close(): void {
    this.db.close();
  }
```

### Step 4 — Re-run same command and expect GREEN
Command:
```bash
bun test test/graph-store.test.ts
```
Expected: PASS for persistence lifecycle test.

### Step 5 — Run full suite + typecheck
Command:
```bash
bun test && bun run check
```
Expected: all tests passing and typecheck passing.

**Acceptance criteria covered:** 42
