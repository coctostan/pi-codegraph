---
id: 3
title: Persist coverage-backed test traces in SQLite
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/graph/store.ts
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-coverage-traces.test.ts
---

### Task 3: Persist coverage-backed test traces in SQLite [depends: 2]

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Create: `test/graph-store-coverage-traces.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore saves, replaces, and loads per-test coverage traces with stored content hashes", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/app.test.ts::appTest:1", kind: "test", name: "appTest", file: "src/app.test.ts", start_line: 1, end_line: 3, content_hash: "h-test" });
    store.addNode({ id: "src/app.ts::prod:1", kind: "function", name: "prod", file: "src/app.ts", start_line: 1, end_line: 3, content_hash: "h-prod" });
    store.addNode({ id: "src/app.ts::helper:5", kind: "function", name: "helper", file: "src/app.ts", start_line: 5, end_line: 7, content_hash: "h-helper" });

    store.saveTestTrace({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::prod:1", ordinal: 1, contentHash: "h-prod" },
      ],
    });

    store.saveTestTrace({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::helper:5", ordinal: 1, contentHash: "h-helper" },
      ],
    });

    expect(store.getTestTrace("src/app.test.ts::appTest:1")).toEqual({
      testNodeId: "src/app.test.ts::appTest:1",
      steps: [
        { nodeId: "src/app.test.ts::appTest:1", ordinal: 0, contentHash: "h-test" },
        { nodeId: "src/app.ts::helper:5", ordinal: 1, contentHash: "h-helper" },
      ],
    });
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-coverage-traces.test.ts`
Expected: FAIL — `TypeError: store.saveTestTrace is not a function`

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

  close(): void {
    this.db.close();
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-coverage-traces.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
