# Plan

### Task 1: Add read-only SQL queryRows to GraphStore

### Task 1: Add read-only SQL queryRows to GraphStore

**Covers AC:** 17

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-query-rows.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.queryRows executes parameterized SELECT queries", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::alpha:1",
    kind: "function",
    name: "alpha",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/b.ts::beta:1",
    kind: "class",
    name: "beta",
    file: "src/b.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h2",
  });

  const rows = store.queryRows<{ id: string; name: string }>(
    "SELECT id, name FROM nodes WHERE kind = ? ORDER BY id ASC",
    ["function"],
  );

  expect(rows).toEqual([
    { id: "src/a.ts::alpha:1", name: "alpha" },
  ]);

  expect(() => store.queryRows("DELETE FROM nodes", [])).toThrow(
    "queryRows only supports SELECT statements",
  );

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-query-rows.test.ts`
Expected: FAIL — `TypeError: store.queryRows is not a function`

**Step 3 — Write minimal implementation**
`src/graph/store.ts`
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

export interface TestTraceStep {
  nodeId: string;
  ordinal: number;
  contentHash: string;
}

export interface TestTraceRecord {
  testNodeId: string;
  steps: TestTraceStep[];
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
  getUnresolvedEdges(): GraphEdge[];
  getEdgesBySource(sourceId: string): GraphEdge[];
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  saveTestTrace(trace: TestTraceRecord): void;
  getTestTrace(testNodeId: string): TestTraceRecord | null;
  queryRows<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  close(): void;
}
```

`src/graph/sqlite.ts`
```ts
import { createRequire } from "node:module";
import type { GraphStore, NeighborOptions, NeighborResult, TestTraceRecord, TestTraceStep } from "./store.js";
import type { GraphEdge, GraphNode } from "./types.js";
const _require = createRequire(import.meta.url);

function openDb(path: string): any {
  if ((process.versions as any).bun) {
    const { Database } = _require("bun:sqlite");
    return new Database(path);
  }
  const { DatabaseSync } = _require("node:sqlite");
  return new DatabaseSync(path);
}

interface NeighborRow {
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
  provenance_source: GraphEdge["provenance"]["source"];
  confidence: number;
  evidence: string;
  edge_hash: string;
  created_at: number;
}

export class SqliteGraphStore implements GraphStore {
  private db: any;

  constructor(dbPath: string = ":memory:") {
    this.db = openDb(dbPath);
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
        provenance_source TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance_source)
      );

      CREATE TABLE IF NOT EXISTS file_hashes (
        file TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS test_trace_steps (
        test_node_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        PRIMARY KEY (test_node_id, ordinal)
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
    `);

    const existing = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null;
    if (!existing) {
      this.db.prepare("INSERT INTO schema_version(version) VALUES (1)").run();
    }
  }

  addNode(node: GraphNode): void {
    this.db.prepare(`INSERT OR REPLACE INTO nodes (id, kind, name, file, start_line, end_line, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(node.id, node.kind, node.name, node.file, node.start_line, node.end_line ?? null, node.content_hash);
  }

  addEdge(edge: GraphEdge): void {
    this.db.prepare(`INSERT OR REPLACE INTO edges (source, target, kind, provenance_source, confidence, evidence, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(edge.source, edge.target, edge.kind, edge.provenance.source, edge.provenance.confidence, edge.provenance.evidence, edge.provenance.content_hash, edge.created_at);
  }

  getNode(id: string): GraphNode | null {
    const row = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE id = ?`).get(id) as GraphNode | null;
    return row ? { ...row } : null;
  }

  findNodes(name: string, file?: string): GraphNode[] {
    const sql = file
      ? `SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE name = ? AND file = ?`
      : `SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE name = ?`;
    const rows = (file ? this.db.prepare(sql).all(name, file) : this.db.prepare(sql).all(name)) as GraphNode[];
    return rows.map((row) => ({ ...row }));
  }

  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
    const direction = options?.direction ?? "both";
    const kind = options?.kind;
    if (direction === "out") return this.fetchNeighborRows(nodeId, "out", kind);
    if (direction === "in") return this.fetchNeighborRows(nodeId, "in", kind);
    return [...this.fetchNeighborRows(nodeId, "out", kind), ...this.fetchNeighborRows(nodeId, "in", kind)];
  }

  private fetchNeighborRows(nodeId: string, direction: "in" | "out", kind?: GraphEdge["kind"]): NeighborResult[] {
    const [joinOn, whereField] = direction === "out" ? ["e.target", "e.source"] : ["e.source", "e.target"];
    const baseSQL = `
      SELECT n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind,
             e.provenance_source, e.confidence, e.evidence,
             e.content_hash as edge_hash, e.created_at
      FROM edges e
      JOIN nodes n ON n.id = ${joinOn}
      WHERE ${whereField} = ?`;
    const sql = kind ? `${baseSQL} AND e.kind = ?` : baseSQL;
    const rows = (kind ? this.db.prepare(sql).all(nodeId, kind) : this.db.prepare(sql).all(nodeId)) as NeighborRow[];
    return rows.map((row) => ({
      node: { id: row.id, kind: row.kind, name: row.name, file: row.file, start_line: row.start_line, end_line: row.end_line, content_hash: row.content_hash },
      edge: {
        source: row.source,
        target: row.target,
        kind: row.edge_kind,
        provenance: { source: row.provenance_source, confidence: row.confidence, evidence: row.evidence, content_hash: row.edge_hash },
        created_at: row.created_at,
      },
    }));
  }

  private static edgeFromRow(row: { source: string; target: string; kind: string; provenance_source: string; confidence: number; evidence: string; content_hash: string; created_at: number }): GraphEdge {
    return {
      source: row.source,
      target: row.target,
      kind: row.kind as GraphEdge["kind"],
      provenance: { source: row.provenance_source as GraphEdge["provenance"]["source"], confidence: row.confidence, evidence: row.evidence, content_hash: row.content_hash },
      created_at: row.created_at,
    };
  }

  getUnresolvedEdges(): GraphEdge[] {
    const rows = this.db.prepare(`SELECT source, target, kind, provenance_source, confidence, evidence, content_hash, created_at FROM edges WHERE SUBSTR(target, 1, 16) = '__unresolved__::' ORDER BY created_at ASC`).all() as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  getEdgesBySource(sourceId: string): GraphEdge[] {
    const rows = this.db.prepare(`SELECT source, target, kind, provenance_source, confidence, evidence, content_hash, created_at FROM edges WHERE source = ? ORDER BY created_at ASC`).all(sourceId) as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void {
    this.db.prepare(`DELETE FROM edges WHERE source = ? AND target = ? AND kind = ? AND provenance_source = ?`).run(source, target, kind, provenanceSource);
  }

  getNodesByFile(file: string): GraphNode[] {
    const rows = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash FROM nodes WHERE file = ? ORDER BY start_line ASC, id ASC`).all(file) as GraphNode[];
    return rows.map((row) => ({ ...row }));
  }

  deleteFile(file: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM edges WHERE provenance_source != 'agent' AND (source IN (SELECT id FROM nodes WHERE file = ?) OR target IN (SELECT id FROM nodes WHERE file = ?))`).run(file, file);
      this.db.prepare(`DELETE FROM test_trace_steps WHERE test_node_id IN (SELECT id FROM nodes WHERE file = ?) OR node_id IN (SELECT id FROM nodes WHERE file = ?)`).run(file, file);
      this.db.prepare(`DELETE FROM nodes WHERE file = ?`).run(file);
      this.db.prepare(`DELETE FROM file_hashes WHERE file = ?`).run(file);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listFiles(): string[] {
    const rows = this.db.prepare("SELECT file FROM file_hashes ORDER BY file ASC").all() as Array<{ file: string }>;
    return rows.map((row) => row.file);
  }

  getFileHash(file: string): string | null {
    const row = this.db.prepare(`SELECT hash FROM file_hashes WHERE file = ?`).get(file) as { hash: string } | null;
    return row?.hash ?? null;
  }

  setFileHash(file: string, hash: string): void {
    this.db.prepare(`INSERT OR REPLACE INTO file_hashes (file, hash, indexed_at) VALUES (?, ?, ?)`).run(file, hash, Date.now());
  }

  saveTestTrace(trace: TestTraceRecord): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM test_trace_steps WHERE test_node_id = ?`).run(trace.testNodeId);
      const insert = this.db.prepare(`INSERT INTO test_trace_steps (test_node_id, ordinal, node_id, content_hash) VALUES (?, ?, ?, ?)`);
      for (const step of trace.steps) {
        insert.run(trace.testNodeId, step.ordinal, step.nodeId, step.contentHash);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getTestTrace(testNodeId: string): TestTraceRecord | null {
    const rows = this.db.prepare(`SELECT test_node_id, ordinal, node_id, content_hash FROM test_trace_steps WHERE test_node_id = ? ORDER BY ordinal ASC`).all(testNodeId) as Array<{ test_node_id: string; ordinal: number; node_id: string; content_hash: string }>;
    if (rows.length === 0) return null;
    const steps: TestTraceStep[] = rows.map((row) => ({ nodeId: row.node_id, ordinal: row.ordinal, contentHash: row.content_hash }));
    return { testNodeId: rows[0]!.test_node_id, steps };
  }

  queryRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    if (!/^\s*select\b/i.test(sql)) {
      throw new Error("queryRows only supports SELECT statements");
    }
    return this.db.prepare(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-query-rows.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Parse supported Cypher subset into AST [depends: 1]

### Task 2: Parse supported Cypher subset into AST [depends: 1]

**Covers AC:** 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 35

**Files:**
- Create: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery parses one MATCH chain with filters, WHERE, RETURN projections, and LIMIT", () => {
  const ast = parseGraphQuery(
    'MATCH (a {kind: "function", name: "foo"})-[r:calls]->(b {kind: "function"}) WHERE a.name = "foo" AND b.name = "bar" RETURN a, r, b.file LIMIT 5',
  );

  expect(ast.match.left.alias).toBe("a");
  expect(ast.match.left.filters).toEqual({ kind: "function", name: "foo" });
  expect(ast.match.edge).toEqual({ alias: "r", kind: "calls", direction: "out" });
  expect(ast.match.right).toEqual({ alias: "b", filters: { kind: "function" } });
  expect(ast.where).toEqual([
    { alias: "a", property: "name", value: "foo" },
    { alias: "b", property: "name", value: "bar" },
  ]);
  expect(ast.returns).toEqual([
    { kind: "alias", alias: "a" },
    { kind: "alias", alias: "r" },
    { kind: "property", alias: "b", property: "file" },
  ]);
  expect(ast.limit).toBe(5);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query-parser.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
export type GraphQueryErrorKind =
  | "parse_error"
  | "validation_error"
  | "unsupported_error";

export class GraphQueryError extends Error {
  constructor(public kind: GraphQueryErrorKind, message: string) {
    super(message);
    this.name = "GraphQueryError";
  }
}

export interface NodePattern {
  alias: string;
  filters: Partial<Record<"kind" | "name", string>>;
}

export interface EdgePattern {
  alias?: string;
  kind?: string;
  direction: "out" | "in";
}

export interface WhereClause {
  alias: string;
  property: string;
  value: string;
}

export type ReturnProjection =
  | { kind: "alias"; alias: string }
  | { kind: "property"; alias: string; property: string };

export interface GraphQueryAst {
  match: {
    left: NodePattern;
    edge?: EdgePattern;
    right?: NodePattern;
  };
  where: WhereClause[];
  returns: ReturnProjection[];
  limit?: number;
}

function parseNodePattern(input: string): NodePattern {
  const match = input.trim().match(/^\(([^\s\{\)]+)\s*(\{[^\}]+\})?\)$/);
  if (!match) throw new GraphQueryError("parse_error", `invalid node pattern: ${input}`);

  const [, alias, rawFilters] = match;
  const filters: Partial<Record<"kind" | "name", string>> = {};
  if (rawFilters) {
    const inner = rawFilters.slice(1, -1).trim();
    for (const part of inner.split(",")) {
      const propMatch = part.trim().match(/^(kind|name)\s*:\s*"([^"]+)"$/);
      if (!propMatch) throw new GraphQueryError("parse_error", `invalid inline filter: ${part.trim()}`);
      filters[propMatch[1] as "kind" | "name"] = propMatch[2]!;
    }
  }

  return { alias, filters };
}

function parseEdgePattern(input: string): EdgePattern {
  const trimmed = input.trim();
  const out = trimmed.match(/^\[([^:\]]+)?(?::([^\]]+))?\]->$/);
  if (out) {
    return {
      alias: out[1] || undefined,
      kind: out[2] || undefined,
      direction: "out",
    };
  }

  const incoming = trimmed.match(/^<-\[([^:\]]+)?(?::([^\]]+))?\]$/);
  if (incoming) {
    return {
      alias: incoming[1] || undefined,
      kind: incoming[2] || undefined,
      direction: "in",
    };
  }

  throw new GraphQueryError("parse_error", `invalid edge pattern: ${input}`);
}

function splitClauses(query: string): { matchClause: string; whereClause?: string; returnClause: string; limitClause?: string } {
  const normalized = query.trim();
  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}

function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"$/);
    if (!match) throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    return {
      alias: match[1]!,
      property: match[2]!,
      value: match[3]!,
    };
  });
}

function parseReturns(returnClause: string): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
    if (prop) {
      return { kind: "property" as const, alias: prop[1]!, property: prop[2]! };
    }
    return { kind: "alias" as const, alias: trimmed };
  });
}

export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);

  const traversalMatch = matchClause.match(/^(\([^\)]+\))\s*-(\[[^\]]*\]->|<\[[^\]]*\])\s*(\([^\)]+\))$/);
  if (traversalMatch) {
    return {
      match: {
        left: parseNodePattern(traversalMatch[1]!),
        edge: parseEdgePattern(traversalMatch[2]!),
        right: parseNodePattern(traversalMatch[3]!),
      },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause),
      limit: limitClause ? Number(limitClause) : undefined,
    };
  }

  return {
    match: { left: parseNodePattern(matchClause) },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause),
    limit: limitClause ? Number(limitClause) : undefined,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Reject multiple MATCH clauses in parseGraphQuery [depends: 2]

### Task 3: Reject multiple MATCH clauses in parseGraphQuery [depends: 2]

**Covers AC:** 3, 24

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-match-clause.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when a query contains multiple MATCH clauses", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) MATCH (b {name: "bar"}) RETURN a'),
  ).toThrowError(/query must contain exactly one MATCH clause/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-match-clause.test.ts`
Expected: FAIL — `expected function to throw error matching /query must contain exactly one MATCH clause/`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function splitClauses(query: string): {
  matchClause: string;
  whereClause?: string;
  returnClause: string;
  limitClause?: string;
} {
  const normalized = query.trim();

  if ((normalized.match(/\bMATCH\b/gi) ?? []).length !== 1) {
    throw new GraphQueryError("parse_error", "query must contain exactly one MATCH clause");
  }

  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-match-clause.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Compile parsed graph queries to parameterized SQL [depends: 2, 3]

### Task 4: Compile parsed graph queries to parameterized SQL [depends: 2, 3]

**Covers AC:** 17, 36

**Files:**
- Create: `src/tools/graph-query-compiler.ts`
- Test: `test/graph-query-compiler.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits deterministic SQL joins and bound parameters", () => {
  const ast = parseGraphQuery(
    'MATCH (a {kind: "function", name: "foo"})-[r:calls]->(b {kind: "function"}) WHERE b.name = "bar" RETURN a, r, b.file LIMIT 3',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("FROM nodes n0");
  expect(compiled.sql).toContain("JOIN edges e0 ON e0.source = n0.id");
  expect(compiled.sql).toContain("JOIN nodes n1 ON n1.id = e0.target");
  expect(compiled.sql).toContain("n0.kind = ?");
  expect(compiled.sql).toContain("n0.name = ?");
  expect(compiled.sql).toContain("e0.kind = ?");
  expect(compiled.sql).toContain("n1.kind = ?");
  expect(compiled.sql).toContain("n1.name = ?");
  expect(compiled.sql).toContain("LIMIT ?");
  expect(compiled.sql).not.toContain('foo');
  expect(compiled.sql).not.toContain('bar');
  expect(compiled.params).toEqual([
    'function',
    'foo',
    'calls',
    'function',
    'bar',
    3,
  ]);
  expect(compiled.columns.map((c) => c.key)).toEqual([
    'a',
    'r',
    'b.file',
  ]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-compiler.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query-compiler.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-compiler.ts`
```ts
import type { GraphQueryAst, ReturnProjection } from "./graph-query-parser.js";

export type CompiledColumn =
  | { key: string; kind: "node"; alias: string; sqlAliasPrefix: string }
  | { key: string; kind: "edge"; alias: string; sqlAliasPrefix: string }
  | { key: string; kind: "scalar"; alias: string; property: string; sqlAlias: string };

export interface CompiledGraphQuery {
  sql: string;
  params: Array<string | number>;
  columns: CompiledColumn[];
}

const NODE_FIELDS = ["id", "kind", "name", "file", "start_line", "end_line", "content_hash"] as const;
const EDGE_FIELDS = ["source", "target", "kind", "provenance_source", "confidence", "evidence", "content_hash", "created_at"] as const;

function pushNodeSelect(selects: string[], tableAlias: string, resultAlias: string): void {
  for (const field of NODE_FIELDS) {
    selects.push(`${tableAlias}.${field} AS ${resultAlias}__${field}`);
  }
}

function pushEdgeSelect(selects: string[], tableAlias: string, resultAlias: string): void {
  for (const field of EDGE_FIELDS) {
    selects.push(`${tableAlias}.${field} AS ${resultAlias}__${field}`);
  }
}

function compileReturnProjection(selects: string[], columns: CompiledColumn[], projection: ReturnProjection, nodeAliases: Record<string, string>, edgeAliases: Record<string, string>): void {
  if (projection.kind === "alias") {
    if (nodeAliases[projection.alias]) {
      const prefix = projection.alias;
      pushNodeSelect(selects, nodeAliases[projection.alias]!, prefix);
      columns.push({ key: projection.alias, kind: "node", alias: projection.alias, sqlAliasPrefix: prefix });
      return;
    }

    const prefix = projection.alias;
    pushEdgeSelect(selects, edgeAliases[projection.alias]!, prefix);
    columns.push({ key: projection.alias, kind: "edge", alias: projection.alias, sqlAliasPrefix: prefix });
    return;
  }

  const sqlAlias = `${projection.alias}__${projection.property}__scalar`;
  const tableAlias = nodeAliases[projection.alias] ?? edgeAliases[projection.alias];
  selects.push(`${tableAlias}.${projection.property} AS ${sqlAlias}`);
  columns.push({ key: `${projection.alias}.${projection.property}`, kind: "scalar", alias: projection.alias, property: projection.property, sqlAlias });
}

export function compileGraphQuery(ast: GraphQueryAst): CompiledGraphQuery {
  const params: Array<string | number> = [];
  const selects: string[] = [];
  const wheres: string[] = [];
  const columns: CompiledColumn[] = [];

  const nodeAliases: Record<string, string> = { [ast.match.left.alias]: "n0" };
  const edgeAliases: Record<string, string> = {};

  let from = "FROM nodes n0";
  if (ast.match.edge && ast.match.right) {
    edgeAliases[ast.match.edge.alias ?? "_edge"] = "e0";
    nodeAliases[ast.match.right.alias] = "n1";
    from += ast.match.edge.direction === "out"
      ? " JOIN edges e0 ON e0.source = n0.id JOIN nodes n1 ON n1.id = e0.target"
      : " JOIN edges e0 ON e0.target = n0.id JOIN nodes n1 ON n1.id = e0.source";
  }

  for (const [property, value] of Object.entries(ast.match.left.filters)) {
    wheres.push(`n0.${property} = ?`);
    params.push(value!);
  }

  if (ast.match.edge?.kind) {
    wheres.push(`e0.kind = ?`);
    params.push(ast.match.edge.kind);
  }

  if (ast.match.right) {
    for (const [property, value] of Object.entries(ast.match.right.filters)) {
      wheres.push(`n1.${property} = ?`);
      params.push(value!);
    }
  }

  for (const predicate of ast.where) {
    const tableAlias = nodeAliases[predicate.alias]!;
    wheres.push(`${tableAlias}.${predicate.property} = ?`);
    params.push(predicate.value);
  }

  const effectiveEdgeAliases = ast.match.edge?.alias ? edgeAliases : {};
  for (const projection of ast.returns) {
    compileReturnProjection(selects, columns, projection, nodeAliases, effectiveEdgeAliases);
  }

  let sql = `SELECT ${selects.join(", ")} ${from}`;
  if (wheres.length > 0) sql += ` WHERE ${wheres.join(" AND ")}`;
  if (ast.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(ast.limit);
  }

  return { sql, params, columns };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-compiler.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Render anchored node rows for graph query results [depends: 4]

### Task 5: Render anchored node rows for graph query results [depends: 4]

**Covers AC:** 37

**Files:**
- Create: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-node.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows renders anchored node aliases", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-render-node-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function alpha() {}\n");

  try {
    const columns: CompiledColumn[] = [{ key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" }];
    const output = renderGraphQueryRows(
      [{
        a__id: "src/a.ts::alpha:1",
        a__kind: "function",
        a__name: "alpha",
        a__file: "src/a.ts",
        a__start_line: 1,
        a__end_line: 1,
        a__content_hash: "7ebd94f58d9952f6b7f251fefe95c24daaf58e7123a6e5196d0f86d3b7234ce4",
      }],
      columns,
      projectRoot,
    );

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/a.ts:1:");
    expect(output).toContain("alpha");
    expect(output).toContain("function");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-node.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query-render.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
import { computeAnchor } from "../output/anchoring.js";
import type { CompiledColumn } from "./graph-query-compiler.js";

interface GraphNodeRow {
  id: string;
  kind: string;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

function readNode(row: Record<string, unknown>, prefix: string): GraphNodeRow {
  return {
    id: String(row[`${prefix}__id`]),
    kind: String(row[`${prefix}__kind`]),
    name: String(row[`${prefix}__name`]),
    file: String(row[`${prefix}__file`]),
    start_line: Number(row[`${prefix}__start_line`]),
    end_line: row[`${prefix}__end_line`] == null ? null : Number(row[`${prefix}__end_line`]),
    content_hash: String(row[`${prefix}__content_hash`]),
  };
}

export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind !== "node") continue;
      const node = readNode(row, column.sqlAliasPrefix);
      const anchor = computeAnchor(node, projectRoot);
      lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}`);
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-render-node.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Execute node-only graph queries end to end [depends: 1, 2, 3, 4, 5]

### Task 6: Execute node-only graph queries end to end [depends: 1, 2, 3, 4, 5]

**Covers AC:** 18, 41

**Files:**
- Create: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-node.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery executes a node-only query and renders anchored results", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-node-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function hello() { return 'world'; }\n";
  writeFileSync(join(projectRoot, "src/hello.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: require("../src/indexer/tree-sitter.js").sha256Hex(content),
    });

    const output = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/hello.ts:1:");
    expect(output).toContain("hello");
    expect(output).toContain("function");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-node.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryRows } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  try {
    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);
    const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
    return renderGraphQueryRows(rows, compiled.columns, params.projectRoot);
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return `${error.kind}: ${error.message}\n`;
    }
    throw error;
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-node.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: Return execution_error when compiled SQL execution fails [depends: 6]

### Task 7: Return execution_error when compiled SQL execution fails [depends: 6]

**Covers AC:** 34

**Files:**
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-execution-error.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery converts store execution failures into execution_error output", () => {
  const fakeStore = {
    queryRows() {
      throw new Error("sqlite busy");
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "hello"}) RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toBe("execution_error: failed to execute compiled query\n");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-execution-error.test.ts`
Expected: FAIL — `Error: sqlite busy`

**Step 3 — Write minimal implementation**
`src/tools/graph-query.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryRows } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  try {
    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);

    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      return renderGraphQueryRows(rows, compiled.columns, params.projectRoot);
    } catch {
      return "execution_error: failed to execute compiled query\n";
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return `${error.kind}: ${error.message}\n`;
    }
    throw error;
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-execution-error.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 8: Execute traversal queries without edge aliases [depends: 6]

### Task 8: Execute traversal queries without edge aliases [depends: 6]

**Covers AC:** 8, 9, 42, 43, 44, 45

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/tool-graph-query-traversal-no-edge-alias.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery executes canonical incoming traversal with no edge alias", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-traversal-no-edge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const aContent = "export function foo() { bar(); }\n";
  const bContent = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) });
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "lsp", confidence: 0.9, evidence: "ref", content_hash: sha256Hex(aContent) },
      created_at: 1,
    });

    const output = graphQuery({
      query: 'MATCH (b {kind: "function"})<-[:calls]-(a {name: "foo"}) WHERE b.name = "bar" RETURN a, b.file LIMIT 1',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/a.ts:1:");
    expect(output).toContain("b.file: src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-traversal-no-edge-alias.test.ts`
Expected: FAIL — parse error for incoming traversal syntax

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);
  const limit = limitClause ? Number(limitClause) : undefined;
  if (limit !== undefined && limit <= 0) {
    throw new GraphQueryError("parse_error", "LIMIT must be a positive integer");
  }

  const traversalMatch = matchClause.match(
    /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)(\([^\)]+\))$/,
  );

  if (traversalMatch) {
    const left = parseNodePattern(traversalMatch[1]!);
    const outgoingEdge = traversalMatch[2];
    const incomingEdge = traversalMatch[3];
    const right = parseNodePattern(traversalMatch[4]!);

    return {
      match: {
        left,
        edge: parseEdgePattern(outgoingEdge ? `${outgoingEdge}->` : `<-${incomingEdge!}`),
        right,
      },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause),
      limit,
    };
  }

  return {
    match: { left: parseNodePattern(matchClause) },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause),
    limit,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-traversal-no-edge-alias.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 9: Return parse_error for blank graphQuery input [depends: 6]

### Task 9: Return parse_error for blank graphQuery input [depends: 6]

**Covers AC:** 24

**Files:**
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-empty-query.test.ts`
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";
test("graphQuery rejects blank query strings with parse_error", () => {
  const store = new SqliteGraphStore();
  try {
    const output = graphQuery({
      query: "   \n\t  ",
      store,
      projectRoot: "/tmp/project",
    });

    expect(output).toBe("parse_error: query must not be empty\n");
  } finally {
    store.close();
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-empty-query.test.ts`
Expected: FAIL — `expected "parse_error: query must not be empty\n" but received "parse_error: expected MATCH ... RETURN ...\n"`
**Step 3 — Write minimal implementation**
`src/tools/graph-query.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryRows } from "./graph-query-render.js";
export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}
export function graphQuery(params: GraphQueryParams): string {
  try {
    if (params.query.trim().length === 0) {
      return "parse_error: query must not be empty\n";
    }
    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);
    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      return renderGraphQueryRows(rows, compiled.columns, params.projectRoot);
    } catch {
      return "execution_error: failed to execute compiled query\n";
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return `${error.kind}: ${error.message}\n`;
    }
    throw error;
  }
}
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-empty-query.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 10: Register graph_query in the pi extension [depends: 6]

### Task 10: Register graph_query in the pi extension [depends: 6]

**Covers AC:** 1, 2

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-graph-query.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pi extension registers graph_query with query schema and auto-indexes on first call", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-gq-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function hello() { return 'world'; }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    const registeredTools: Array<{ name: string; parameters: any; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: any; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    mod.default(mockPi as any);

    const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
    expect(tool).toBeDefined();
    expect(tool!.parameters.properties.query).toBeDefined();
    expect(tool!.parameters.required).toContain("query");

    const result = await tool!.execute(
      "call-1",
      { query: 'MATCH (a {name: "hello"}) RETURN a' },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("hello");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-graph-query.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` for tool name `graph_query`

**Step 3 — Write minimal implementation**
`src/index.ts`
```ts
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
import { TsServerClient } from "./indexer/tsserver-client.js";
import { computeAnchor } from "./output/anchoring.js";
import { impact } from "./tools/impact.js";
import { graphQuery } from "./tools/graph-query.js";
import { resolveEdge } from "./tools/resolve-edge.js";
import { symbolGraph } from "./tools/symbol-graph.js";
import { trace } from "./tools/trace.js";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const ResolveEdgeParams = Type.Object({
  source: Type.String({ description: "Source symbol name" }),
  target: Type.String({ description: "Target symbol name" }),
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
  evidence: Type.String({ description: "Free-text evidence explaining why this edge exists" }),
  sourceFile: Type.Optional(Type.String({ description: "Source file path to disambiguate" })),
  targetFile: Type.Optional(Type.String({ description: "Target file path to disambiguate" })),
});

const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol name" }), {
    description: "One or more symbol names that changed",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Kind of change" },
  ),
  maxDepth: Type.Optional(Type.Number({ description: "Maximum traversal depth (default 5)" })),
});

const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const GraphQueryParams = Type.Object({
  query: Type.String({ description: "Cypher subset query to execute against the graph" }),
});

let sharedStore: GraphStore | null = null;

export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
}

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  sharedStore = new SqliteGraphStore(join(dbDir, "graph.db"));
  return sharedStore;
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}

function renderImplementationsSuffix(store: GraphStore, node: any, projectRoot: string): string {
  if (node.kind !== "interface") return "";
  const impl = store.getNeighbors(node.id, { direction: "in", kind: "implements" });
  if (impl.length === 0) return "";

  const lines = ["", "### Implementations"];
  for (const it of impl) {
    const anchor = computeAnchor(it.node, projectRoot);
    lines.push(`  ${anchor.anchor}  ${it.node.name}  implements  confidence:${it.edge.provenance.confidence}  ${it.edge.provenance.source}`);
  }
  return lines.join("\n") + "\n";
}

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let resolvedNode: any | null = null;
      const nodes = store.findNodes(params.name, params.file);
      if (nodes.length === 1) {
        resolvedNode = nodes[0]!;
        const client = new TsServerClient(projectRoot);
        try {
          await resolveMissingCallers(resolvedNode, store, projectRoot, client);
          if (resolvedNode.kind === "interface") {
            await resolveImplementations(resolvedNode, store, projectRoot, client);
          }
        } finally {
          await client.shutdown().catch(() => {});
        }
      }

      let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      if (resolvedNode) output += renderImplementationsSuffix(store, resolvedNode, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an edge in the symbol graph with evidence",
    parameters: ResolveEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const output = resolveEdge({
        source: params.source,
        target: params.target,
        sourceFile: params.sourceFile,
        targetFile: params.targetFile,
        kind: params.kind,
        evidence: params.evidence,
        store,
        projectRoot,
      });
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "impact",
    label: "Impact",
    description: "Given changed symbols, return downstream dependents classified by change type",
    parameters: ImpactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = impact({
        symbols: params.symbols,
        changeType: params.changeType,
        store,
        projectRoot,
        maxDepth: params.maxDepth,
      });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });

  pi.registerTool({
    name: "trace",
    label: "Trace",
    description: "Return one deterministic anchored execution path for a test, symbol, or endpoint",
    parameters: TraceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });

  pi.registerTool({
    name: "graph_query",
    label: "Graph Query",
    description: "Execute a Cypher subset query against the graph",
    parameters: GraphQueryParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = graphQuery({ query: params.query, store, projectRoot });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-graph-query.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 11: Reject duplicate RETURN clauses in parseGraphQuery [depends: 3]

### Task 11: Reject duplicate RETURN clauses in parseGraphQuery [depends: 3]

**Covers AC:** 4, 24

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-return-clause.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when a query contains duplicate RETURN clauses", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) RETURN a RETURN a.name'),
  ).toThrowError(/query must contain exactly one RETURN clause/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-return-clause.test.ts`
Expected: FAIL — duplicate RETURN currently parses instead of returning exact-count parse error

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function splitClauses(query: string): {
  matchClause: string;
  whereClause?: string;
  returnClause: string;
  limitClause?: string;
} {
  const normalized = query.trim();

  if ((normalized.match(/\bMATCH\b/gi) ?? []).length !== 1) {
    throw new GraphQueryError("parse_error", "query must contain exactly one MATCH clause");
  }

  if ((normalized.match(/\bRETURN\b/gi) ?? []).length !== 1) {
    throw new GraphQueryError("parse_error", "query must contain exactly one RETURN clause");
  }

  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-return-clause.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 12: Reject non-positive LIMIT values in parseGraphQuery [depends: 8, 11]

### Task 12: Reject non-positive LIMIT values in parseGraphQuery [depends: 8, 11]

**Covers AC:** 13, 24

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-limit.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when LIMIT is non-positive", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) RETURN a LIMIT 0'),
  ).toThrowError(/LIMIT must be a positive integer/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-limit.test.ts`
Expected: FAIL — parser currently accepts `LIMIT 0`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);
  const limit = limitClause ? Number(limitClause) : undefined;

  if (limit !== undefined && limit <= 0) {
    throw new GraphQueryError("parse_error", "LIMIT must be a positive integer");
  }

  const traversalMatch = matchClause.match(
    /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)(\([^\)]+\))$/,
  );

  if (traversalMatch) {
    const left = parseNodePattern(traversalMatch[1]!);
    const outgoingEdge = traversalMatch[2];
    const incomingEdge = traversalMatch[3];
    const right = parseNodePattern(traversalMatch[4]!);

    return {
      match: {
        left,
        edge: parseEdgePattern(outgoingEdge ? `${outgoingEdge}->` : `<-${incomingEdge!}`),
        right,
      },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause),
      limit,
    };
  }

  return {
    match: { left: parseNodePattern(matchClause) },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause),
    limit,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-limit.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 13: Validate alias references in graph queries [depends: 12]

### Task 13: Validate alias references in graph queries [depends: 12]

**Covers AC:** 25

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-validation-alias.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unbound aliases", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN b'))
    .toThrowError(/alias "b" is not bound/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-validation-alias.test.ts`
Expected: FAIL — undeclared aliases currently parse through

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function parseReturns(returnClause: string, nodeAliases: Set<string>, edgeAliases: Set<string>): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);

    if (prop) {
      const alias = prop[1]!;
      const property = prop[2]!;
      if (!nodeAliases.has(alias) && !edgeAliases.has(alias)) {
        throw new GraphQueryError("validation_error", `alias "${alias}" is not bound`);
      }
      return { kind: "property" as const, alias, property };
    }

    if (!nodeAliases.has(trimmed) && !edgeAliases.has(trimmed)) {
      throw new GraphQueryError("validation_error", `alias "${trimmed}" is not bound`);
    }

    return { kind: "alias" as const, alias: trimmed };
  });
}

export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);
  const limit = limitClause ? Number(limitClause) : undefined;

  const traversalMatch = matchClause.match(
    /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)(\([^\)]+\))$/,
  );

  if (traversalMatch) {
    const left = parseNodePattern(traversalMatch[1]!);
    const outgoingEdge = traversalMatch[2];
    const incomingEdge = traversalMatch[3];
    const right = parseNodePattern(traversalMatch[4]!);
    const edge = parseEdgePattern(outgoingEdge ? `${outgoingEdge}->` : `<-${incomingEdge!}`);

    const nodeAliases = new Set([left.alias, right.alias]);
    const edgeAliases = new Set<string>();
    if (edge.alias) edgeAliases.add(edge.alias);

    return {
      match: { left, edge, right },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause, nodeAliases, edgeAliases),
      limit,
    };
  }

  const left = parseNodePattern(matchClause);
  const nodeAliases = new Set([left.alias]);

  return {
    match: { left },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause, nodeAliases, new Set<string>()),
    limit,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-validation-alias.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 14: Reject OR predicates in graph query WHERE clauses [depends: 13]

### Task 14: Reject OR predicates in graph query WHERE clauses [depends: 13]

**Covers AC:** 28

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-or.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for OR", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) WHERE a.name = "foo" OR a.kind = "function" RETURN a'))
    .toThrowError(/OR is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-or.test.ts`
Expected: FAIL — parser currently returns parse_error for invalid WHERE predicate instead of unsupported_error

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];

  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError("unsupported_error", "OR is not supported");
  }

  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"$/);
    if (!match) {
      throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    }
    return { alias: match[1]!, property: match[2]!, value: match[3]! };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-or.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 15: Render structural edge rows for graph query results [depends: 5]

### Task 15: Render structural edge rows for graph query results [depends: 5]

**Covers AC:** 38

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-edge.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows renders structural edge aliases", () => {
  const columns: CompiledColumn[] = [
    { key: "r", kind: "edge", alias: "r", sqlAliasPrefix: "r" },
  ];

  const output = renderGraphQueryRows(
    [
      {
        r__source: "src/a.ts::alpha:1",
        r__target: "src/b.ts::beta:1",
        r__kind: "calls",
        r__provenance_source: "lsp",
        r__confidence: 0.9,
        r__evidence: "ref",
        r__content_hash: "h1",
        r__created_at: 1,
      },
    ],
    columns,
    "/tmp/project",
  );

  expect(output).toContain("r: calls");
  expect(output).toContain("provenance:lsp");
  expect(output).toContain("confidence:0.9");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-edge.test.ts`
Expected: FAIL — `expected "rows: 1\nrow 1\n" to contain "r: calls"`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}`);
        continue;
      }

      if (column.kind === "edge") {
        lines.push(
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}`,
        );
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-render-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 16: Mark stale anchored nodes in rendered graph query results [depends: 15]

### Task 16: Mark stale anchored nodes in rendered graph query results [depends: 15]

**Covers AC:** 39

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-stale.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows appends a stale marker for stale node anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-render-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function alpha() {}\n");

  try {
    const columns: CompiledColumn[] = [
      { key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" },
    ];

    const output = renderGraphQueryRows(
      [
        {
          a__id: "src/a.ts::alpha:1",
          a__kind: "function",
          a__name: "alpha",
          a__file: "src/a.ts",
          a__start_line: 1,
          a__end_line: 1,
          a__content_hash: "stale-hash",
        },
      ],
      columns,
      projectRoot,
    );

    expect(output).toContain("[stale]");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-stale.test.ts`
Expected: FAIL — `expected "rows: 1\nrow 1\n  a: src/a.ts:1:` to contain "[stale]"`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }

      if (column.kind === "edge") {
        lines.push(
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}`,
        );
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-render-stale.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 17: Render rows zero for empty graph query results [depends: 16]

### Task 17: Render rows zero for empty graph query results [depends: 16]

**Covers AC:** 40

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-empty.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows returns structured empty output for zero rows", () => {
  const columns: CompiledColumn[] = [
    { key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" },
  ];

  expect(renderGraphQueryRows([], columns, "/tmp/project")).toBe("rows: 0\n");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-empty.test.ts`
Expected: FAIL — `expected "rows: 0\n" but received "rows: 0\nrow 1..."` or another non-short-circuited value because `renderGraphQueryRows()` does not yet return early for empty rows

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  if (rows.length === 0) {
    return "rows: 0\n";
  }

  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }

      if (column.kind === "edge") {
        lines.push(
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}`,
        );
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-render-empty.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 18: Execute traversal queries that return an edge alias [depends: 8, 15]

### Task 18: Execute traversal queries that return an edge alias [depends: 8, 15]

**Covers AC:** 20, 21, 42, 44, 45

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-traversal-edge-alias.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery renders returned traversal edge aliases with provenance details", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-traversal-edge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() { bar(); }\n";
  const bContent = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(aContent),
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(bContent),
    });
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: "ref",
        content_hash: sha256Hex(aContent),
      },
      created_at: 1,
    });

    const output = graphQuery({
      query: 'MATCH (a {name: "foo"})-[r:calls]->(b {name: "bar"}) RETURN a, r LIMIT 1',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("r: calls");
    expect(output).toContain("provenance:lsp");
    expect(output).toContain("confidence:0.9");
    expect(output).toContain("evidence:ref");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-traversal-edge-alias.test.ts`
Expected: FAIL — `expected output to contain "evidence:ref"` because edge rendering currently omits the `evidence:` field

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  if (rows.length === 0) {
    return "rows: 0\n";
  }

  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }

      if (column.kind === "edge") {
        lines.push(
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  source:${String(row[`${column.sqlAliasPrefix}__source`])}  target:${String(row[`${column.sqlAliasPrefix}__target`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}  evidence:${String(row[`${column.sqlAliasPrefix}__evidence`])}`,
        );
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-traversal-edge-alias.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 19: Reject RETURN clause without projections [depends: 11]

### Task 19: Reject RETURN clause without projections [depends: 11]

**Covers AC:** 4, 24

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-return-empty.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when RETURN has no projections", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN'))
    .toThrowError(/query must contain exactly one RETURN clause/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-return-empty.test.ts`
Expected: FAIL — parser currently throws generic parse_error instead of explicit RETURN-count error

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function splitClauses(query: string): {
  matchClause: string;
  whereClause?: string;
  returnClause: string;
  limitClause?: string;
} {
  const normalized = query.trim();

  if ((normalized.match(/\bMATCH\b/gi) ?? []).length !== 1) {
    throw new GraphQueryError("parse_error", "query must contain exactly one MATCH clause");
  }

  if ((normalized.match(/\bRETURN\b/gi) ?? []).length !== 1 || /\bRETURN\s*$/i.test(normalized)) {
    throw new GraphQueryError("parse_error", "query must contain exactly one RETURN clause");
  }

  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-return-empty.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 20: Reject unsupported node filter properties [depends: 13]

### Task 20: Reject unsupported node filter properties [depends: 13]

**Covers AC:** 26

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-validation-filter-property.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unsupported node filter properties", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {file: "src/a.ts"}) RETURN a'),
  ).toThrowError(/property "file" is not allowed on node alias "a"/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-validation-filter-property.test.ts`
Expected: FAIL — parser currently accepts unsupported inline filter keys

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
const NODE_FILTER_PROPERTIES = new Set(["kind", "name"]);

function parseNodePattern(input: string): NodePattern {
  const match = input.trim().match(/^\(([A-Za-z_][A-Za-z0-9_]*)\s*(\{[^\}]+\})?\)$/);
  if (!match) throw new GraphQueryError("parse_error", `invalid node pattern: ${input}`);

  const [, alias, rawFilters] = match;
  const filters: Partial<Record<"kind" | "name", string>> = {};

  if (rawFilters) {
    const inner = rawFilters.slice(1, -1).trim();
    for (const part of inner.split(",")) {
      const propMatch = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]+)"$/);
      if (!propMatch) throw new GraphQueryError("parse_error", `invalid inline filter: ${part.trim()}`);

      const property = propMatch[1]!;
      if (!NODE_FILTER_PROPERTIES.has(property)) {
        throw new GraphQueryError("validation_error", `property "${property}" is not allowed on node alias "${alias}"`);
      }

      filters[property as "kind" | "name"] = propMatch[2]!;
    }
  }

  return { alias: alias!, filters };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-validation-filter-property.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 21: Reject unsupported projection properties [depends: 20]

### Task 21: Reject unsupported projection properties [depends: 20]

**Covers AC:** 27

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-validation-projection-property.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unsupported projection properties", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN a.missing'))
    .toThrowError(/property "missing" is not allowed on alias "a"/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-validation-projection-property.test.ts`
Expected: FAIL — parser currently allows unknown projection properties

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
const NODE_RETURN_PROPERTIES = new Set(["id", "kind", "name", "file", "start_line", "end_line", "content_hash"]);
const EDGE_RETURN_PROPERTIES = new Set(["source", "target", "kind", "provenance_source", "confidence", "evidence", "content_hash", "created_at"]);

function parseReturns(returnClause: string, nodeAliases: Set<string>, edgeAliases: Set<string>): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);

    if (!prop) {
      if (!nodeAliases.has(trimmed) && !edgeAliases.has(trimmed)) {
        throw new GraphQueryError("validation_error", `alias "${trimmed}" is not bound`);
      }
      return { kind: "alias" as const, alias: trimmed };
    }

    const alias = prop[1]!;
    const property = prop[2]!;

    if (!nodeAliases.has(alias) && !edgeAliases.has(alias)) {
      throw new GraphQueryError("validation_error", `alias "${alias}" is not bound`);
    }

    if (nodeAliases.has(alias) && !NODE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError("validation_error", `property "${property}" is not allowed on alias "${alias}"`);
    }

    if (edgeAliases.has(alias) && !EDGE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError("validation_error", `property "${property}" is not allowed on alias "${alias}"`);
    }

    return { kind: "property" as const, alias, property };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-validation-projection-property.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 22: Reject OPTIONAL MATCH [depends: 14]

### Task 22: Reject OPTIONAL MATCH [depends: 14]

**Covers AC:** 29

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-optional-match.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for OPTIONAL MATCH", () => {
  expect(() => parseGraphQuery('OPTIONAL MATCH (a {name: "foo"}) RETURN a'))
    .toThrowError(/OPTIONAL MATCH is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-optional-match.test.ts`
Expected: FAIL — parseGraphQuery currently throws parse_error (`expected MATCH ... RETURN ...`) instead of unsupported_error (`OPTIONAL MATCH is not supported`)

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bOPTIONAL\s+MATCH\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "OPTIONAL MATCH is not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-optional-match.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 23: Reject aggregation in graph queries [depends: 22]

### Task 23: Reject aggregation in graph queries [depends: 22]

**Covers AC:** 30

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-aggregation.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for aggregation", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN COUNT(a)'))
    .toThrowError(/aggregation is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-aggregation.test.ts`
Expected: FAIL — query currently reaches generic parse/validation path instead of `unsupported_error: aggregation is not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bCOUNT\s*\(/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "aggregation is not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-aggregation.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 24: Reject ORDER BY in graph queries [depends: 23]

### Task 24: Reject ORDER BY in graph queries [depends: 23]

**Covers AC:** 31

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-order-by.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for ORDER BY", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN a ORDER BY a.name'))
    .toThrowError(/ORDER BY is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-order-by.test.ts`
Expected: FAIL — parser currently does not return `unsupported_error: ORDER BY is not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bORDER\s+BY\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "ORDER BY is not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-order-by.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 25: Reject mutating Cypher queries [depends: 24]

### Task 25: Reject mutating Cypher queries [depends: 24]

**Covers AC:** 32

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-mutation.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for mutating queries", () => {
  expect(() => parseGraphQuery('CREATE (a {name: "foo"}) RETURN a'))
    .toThrowError(/mutating queries are not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-mutation.test.ts`
Expected: FAIL — parser currently returns parse_error for CREATE query instead of `unsupported_error: mutating queries are not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bCREATE\b|\bMERGE\b|\bDELETE\b|\bSET\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "mutating queries are not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-mutation.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 26: Reject variable-length paths [depends: 25]

### Task 26: Reject variable-length paths [depends: 25]

**Covers AC:** 33

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-variable-length.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for variable-length paths", () => {
  expect(() => parseGraphQuery('MATCH (a)-[*]->(b) RETURN a'))
    .toThrowError(/variable-length paths are not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-variable-length.test.ts`
Expected: FAIL — parser currently returns parse_error for `MATCH (a)-[*]->(b) RETURN a` instead of `unsupported_error: variable-length paths are not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\[\s*\*[^\]]*\]/.test(query)) {
    throw new GraphQueryError("unsupported_error", "variable-length paths are not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-variable-length.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
