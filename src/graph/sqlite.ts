import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { GraphStatistics, GraphStore, NeighborOptions, NeighborResult, TestTraceRecord, TestTraceStep } from "./store.js";
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
  is_exported: number | null;
  signature: string | null;
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
        content_hash TEXT NOT NULL,
        is_exported INTEGER NOT NULL DEFAULT 0
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

      CREATE TABLE IF NOT EXISTS graph_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
    `);

    const existing = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null;
    if (!existing) {
      this.db.prepare("INSERT INTO schema_version(version) VALUES (1)").run();
    }

    const nodeColumns = this.db.prepare("PRAGMA table_info(nodes)").all() as Array<{ name: string }>;
    if (!nodeColumns.some((column) => column.name === "is_exported")) {
      this.db.prepare("ALTER TABLE nodes ADD COLUMN is_exported INTEGER NOT NULL DEFAULT 0").run();
    }
    if (!nodeColumns.some((column) => column.name === "signature")) {
      this.db.prepare("ALTER TABLE nodes ADD COLUMN signature TEXT").run();
    }
  }

  addNode(node: GraphNode): void {
    this.db.prepare(`INSERT OR REPLACE INTO nodes (id, kind, name, file, start_line, end_line, content_hash, is_exported, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(node.id, node.kind, node.name, node.file, node.start_line, node.end_line ?? null, node.content_hash, node.is_exported ? 1 : 0, node.signature ?? null);
  }

  addEdge(edge: GraphEdge): void {
    this.db.prepare(`INSERT OR REPLACE INTO edges (source, target, kind, provenance_source, confidence, evidence, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(edge.source, edge.target, edge.kind, edge.provenance.source, edge.provenance.confidence, edge.provenance.evidence, edge.provenance.content_hash, edge.created_at);
  }

  private hydrateNode(row: { id: string; kind: GraphNode["kind"]; name: string; file: string; start_line: number; end_line: number | null; content_hash: string; is_exported: number | null; signature: string | null; }): GraphNode {
    const node: GraphNode = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      file: row.file,
      start_line: row.start_line,
      end_line: row.end_line,
      content_hash: row.content_hash,
      is_exported: Boolean(row.is_exported),
    };
    if (row.signature != null) {
      node.signature = row.signature;
    }
    return node;
  }
  getNode(id: string): GraphNode | null {
    const row = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash, is_exported, signature FROM nodes WHERE id = ?`).get(id) as Parameters<SqliteGraphStore["hydrateNode"]>[0] | null;
    return row ? this.hydrateNode(row) : null;
  }

  findNodes(name: string, file?: string): GraphNode[] {
    const sql = file
      ? `SELECT id, kind, name, file, start_line, end_line, content_hash, is_exported, signature FROM nodes WHERE name = ? AND file = ?`
      : `SELECT id, kind, name, file, start_line, end_line, content_hash, is_exported, signature FROM nodes WHERE name = ?`;
    const rows = (file ? this.db.prepare(sql).all(name, file) : this.db.prepare(sql).all(name)) as Parameters<SqliteGraphStore["hydrateNode"]>[0][];
    return rows.map((row) => this.hydrateNode(row));
  }

  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
    const direction = options?.direction ?? "both";
    const kind = options?.kind;
    if (direction === "out") return this.fetchNeighborRows(nodeId, "out", kind);
    if (direction === "in") return this.fetchNeighborRows(nodeId, "in", kind);
    const outRows = this.fetchNeighborRows(nodeId, "out", kind);
    const inRows = this.fetchNeighborRows(nodeId, "in", kind);
    const seen = new Set<string>();
    const result: NeighborResult[] = [];
    for (const nr of [...outRows, ...inRows]) {
      const key = `${nr.edge.source}\0${nr.edge.target}\0${nr.edge.kind}\0${nr.edge.provenance.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(nr);
      }
    }
    return result;
  }

  private fetchNeighborRows(nodeId: string, direction: "in" | "out", kind?: GraphEdge["kind"]): NeighborResult[] {
    const [joinOn, whereField] = direction === "out" ? ["e.target", "e.source"] : ["e.source", "e.target"];
    const baseSQL = `
      SELECT n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash, n.is_exported, n.signature,
             e.source, e.target, e.kind as edge_kind,
             e.provenance_source, e.confidence, e.evidence,
             e.content_hash as edge_hash, e.created_at
      FROM edges e
      JOIN nodes n ON n.id = ${joinOn}
      WHERE ${whereField} = ?`;
    const sql = kind ? `${baseSQL} AND e.kind = ?` : baseSQL;
    const rows = (kind ? this.db.prepare(sql).all(nodeId, kind) : this.db.prepare(sql).all(nodeId)) as NeighborRow[];
    return rows.map((row) => {
      const node: GraphNode = {
        id: row.id,
        kind: row.kind,
        name: row.name,
        file: row.file,
        start_line: row.start_line,
        end_line: row.end_line,
        content_hash: row.content_hash,
        is_exported: Boolean(row.is_exported),
      };
      if (row.signature != null) node.signature = row.signature;
      return {
        node,
        edge: {
          source: row.source,
          target: row.target,
          kind: row.edge_kind,
          provenance: { source: row.provenance_source, confidence: row.confidence, evidence: row.evidence, content_hash: row.edge_hash },
          created_at: row.created_at,
        },
      };
    });
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
    const rows = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash, is_exported, signature FROM nodes WHERE file = ? ORDER BY start_line ASC, id ASC`).all(file) as Parameters<SqliteGraphStore["hydrateNode"]>[0][];
    return rows.map((row) => this.hydrateNode(row));
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

    const fileRows = (this.db.prepare("SELECT file, hash FROM file_hashes").all() as Array<{ file: string; hash: string }>).filter((r) => !r.file.startsWith("__"));
    const total = fileRows.length;

    let stale = 0;
    if (projectRoot) {
      for (const row of fileRows) {
        try {
          const content = readFileSync(join(projectRoot, row.file), "utf8");
          const currentHash = createHash("sha256").update(content).digest("hex");
          if (currentHash !== row.hash) stale++;
        } catch {
          stale++;
        }
      }
    }

    return { nodes, edges, files: { total, stale } };
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

  hasCoverageData(): boolean {
    try {
      const row = this.db
        .prepare(`SELECT value FROM graph_metadata WHERE key = ?`)
        .get("coverage_indexed") as { value: string } | null;
      return row?.value === "1";
    } catch {
      // Pre-#082 DBs (no graph_metadata table) and read-only mounts where the
      // IF NOT EXISTS migration silently no-ops both surface as
      // "no such table: graph_metadata". Treat that as 'coverage state
      // unknown' so signal-rendering tools fall back to coverage-unknown
      // instead of crashing on legacy graph databases.
      return false;
    }
  }

  markCoverageIndexed(): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)`)
      .run("coverage_indexed", "1");
  }

  close(): void {
    this.db.close();
  }
}
