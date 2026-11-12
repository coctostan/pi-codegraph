import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { GraphStatistics, GraphStore, NeighborOptions, NeighborResult, RecordedFailure, TestTraceRecord, TestTraceStep } from "./store.js";
import { MEMBER_CALL, UNRESOLVED, type GraphEdge, type GraphNode } from "./types.js";
const _require = createRequire(import.meta.url);
function openDb(path: string, readonly = false): any {
  if ((process.versions as any).bun) {
    const { Database } = _require("bun:sqlite");
    return readonly ? new Database(path, { readonly: true }) : new Database(path);
  }
  const { DatabaseSync } = _require("node:sqlite");
  return new DatabaseSync(path, { readOnly: readonly });
}

/**
 * The extractor's output version. Bump it with any change to what indexing writes for unchanged source: each
 * `file_hashes` row carries the version that wrote it, and a row below this one re-extracts on the next index run;
 * `test/graph-schema-version.test.ts` pins `extractFile` to it.
 * 3 re-extracts indexes whose incremental runs, before index-parity (An incremental index matches a fresh one), kept
 * stale edges or dropped live ones. 4 adds class members and 5 their `obj.m()` calls, from class-trace (Agents trace
 * through classes). 6 stores each call site's own `calls` row, from call-sites (Each call resolves on its own).
 */
export const SCHEMA_VERSION = 6;
/** The `schema_version` the index at `dbPath` records, 0 for one from before the table, read on a read-only connection so its bytes stay as they are. */
export function readSchemaVersion(dbPath: string): number {
  const db = openDb(dbPath, true);
  try {
    // Wait out another session's commit rather than fail.
    db.exec("PRAGMA busy_timeout = 2000");
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get()) return 0;
    return (db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | undefined)?.version ?? 0;
  } finally {
    db.close();
  }
}
/** The `graph_metadata` key holding the git stage's last-seen HEAD. */
export const GIT_HEAD_METADATA_KEY = "git_cochange_head";
/** The `graph_metadata` key `markCoverageIndexed` sets once a coverage report maps to a node. */
export const COVERAGE_INDEXED_METADATA_KEY = "coverage_indexed";
const RESOLVER_MARKER_PREFIX = "resolver:";
/** The `graph_metadata` key marking `symbolId`'s `kind` resolved, so `symbol_graph` asks tsserver once; every one goes when any file is re-extracted or removed. */
export function resolverMarkerKey(kind: "callers" | "implementations", symbolId: string): string {
  return `${RESOLVER_MARKER_PREFIX}${kind}:${symbolId}`;
}
/** SQL true when `column` holds an id under `marker`, `UNRESOLVED` or `MEMBER_CALL`, as `isUnresolved` and `isMemberCall` test. */
export function markerSql(column: string, marker: typeof UNRESOLVED | typeof MEMBER_CALL): string {
  return `SUBSTR(${column}, 1, ${marker.length + 2}) = '${marker}::'`;
}
const FAILED_LOOKUPS_COLUMNS = "kind TEXT NOT NULL, source TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY (kind, source, evidence)";
const EDGES_COLUMNS = `source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, provenance_source TEXT NOT NULL,
  confidence REAL NOT NULL, evidence TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  call_end_line INTEGER, call_end_col INTEGER`;
/** An edge's key: a call's own site among it, so each call is a row of its own; a siteless edge's site reads 0. */
const EDGE_KEY = "source, target, kind, provenance_source, IFNULL(call_end_line, 0), IFNULL(call_end_col, 0)";
/** Where the git stage kept its HEAD before index-honesty (The index says when it lost data): a `file_hashes` row. */
const LEGACY_GIT_HEAD_FILE = "__git_cochange_head__";

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
  call_end_line: number | null;
  call_end_col: number | null;
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

      CREATE TABLE IF NOT EXISTS edges (${EDGES_COLUMNS});

      CREATE TABLE IF NOT EXISTS file_hashes (
        file TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        partial INTEGER NOT NULL DEFAULT 0,
        extractor_version INTEGER NOT NULL DEFAULT 0
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

      CREATE TABLE IF NOT EXISTS failed_lookups (${FAILED_LOOKUPS_COLUMNS});

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );
    `);

    const columns: Array<[table: string, name: string, type: string]> = [
      ["nodes", "is_exported", "INTEGER NOT NULL DEFAULT 0"],
      ["nodes", "signature", "TEXT"],
      ["file_hashes", "partial", "INTEGER NOT NULL DEFAULT 0"],
      // 0, below every version: rows from before version-skew (Indexes stay honest across versions), and those its
      // older code writes, naming no stamp, re-extract.
      ["file_hashes", "extractor_version", "INTEGER NOT NULL DEFAULT 0"],
      ["edges", "call_end_line", "INTEGER"],
      ["edges", "call_end_col", "INTEGER"],
    ];
    for (const [table, name, type] of columns) {
      const existingColumns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!existingColumns.some((column) => column.name === name)) this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
    }
    // Before one-path (The index has one honest path), failed_lookups held failed `definition` lookups alone, keyed
    // without a kind; a key can't change in place, so the table is rebuilt.
    const lookupColumns = this.db.prepare("PRAGMA table_info(failed_lookups)").all() as Array<{ name: string }>;
    if (!lookupColumns.some((column) => column.name === "kind")) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(`
          ALTER TABLE failed_lookups RENAME TO failed_lookups_v1;
          CREATE TABLE failed_lookups (${FAILED_LOOKUPS_COLUMNS});
          INSERT INTO failed_lookups (kind, source, evidence) SELECT 'definition', source, evidence FROM failed_lookups_v1;
          DROP TABLE failed_lookups_v1;
        `);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }

    // An index from before index-honesty (The index says when it lost data) kept the git head as a `file_hashes` row.
    const legacyHead = this.db.prepare("SELECT hash FROM file_hashes WHERE file = ?").get(LEGACY_GIT_HEAD_FILE) as { hash: string } | null;
    if (legacyHead) {
      this.db.exec("BEGIN");
      try {
        this.db.prepare("INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)").run(GIT_HEAD_METADATA_KEY, legacyHead.hash);
        this.db.prepare("DELETE FROM file_hashes WHERE file = ?").run(LEGACY_GIT_HEAD_FILE);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    // It also kept resolver markers as nodes, each with an edge into its symbol, both alone in holding this hash.
    if (this.db.prepare("SELECT 1 FROM nodes WHERE content_hash = 'meta' LIMIT 1").get()) {
      this.db.exec("BEGIN");
      try {
        this.db.prepare("DELETE FROM edges WHERE content_hash = 'meta'").run();
        this.db.prepare("DELETE FROM nodes WHERE content_hash = 'meta'").run();
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    // Before call-sites (Each call resolves on its own), the edges' primary key held no call site, so a caller's calls
    // to one target shared a row; a key can't change in place, so the table is rebuilt, `idx_edges_key` its key.
    const edgeColumns = this.db.prepare("PRAGMA table_info(edges)").all() as Array<{ pk: number }>;
    if (edgeColumns.some((column) => column.pk > 0)) {
      const names = "source, target, kind, provenance_source, confidence, evidence, content_hash, created_at, call_end_line, call_end_col";
      this.db.exec("BEGIN");
      try {
        this.db.exec(`
          ALTER TABLE edges RENAME TO edges_v1;
          CREATE TABLE edges (${EDGES_COLUMNS});
          INSERT INTO edges (${names}) SELECT ${names} FROM edges_v1;
          DROP TABLE edges_v1;
        `);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_key ON edges(${EDGE_KEY});
    `);

    // Below SCHEMA_VERSION, an older extractor wrote the rows, each stamped below it, so each re-extracts; rerun the
    // git stage too (its head key), whose edges the re-extraction drops. In one transaction: a version bumped without
    // the reset would skip it on every later open.
    const existing = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | null;
    if ((existing?.version ?? 0) >= SCHEMA_VERSION) return;
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM schema_version").run();
      this.db.prepare("INSERT INTO schema_version(version) VALUES (?)").run(SCHEMA_VERSION);
      this.db.prepare("DELETE FROM graph_metadata WHERE key = ?").run(GIT_HEAD_METADATA_KEY);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  addNode(node: GraphNode): void {
    this.db.prepare(`INSERT OR REPLACE INTO nodes (id, kind, name, file, start_line, end_line, content_hash, is_exported, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(node.id, node.kind, node.name, node.file, node.start_line, node.end_line ?? null, node.content_hash, node.is_exported ? 1 : 0, node.signature ?? null);
  }

  addEdge(edge: GraphEdge): void {
    this.db.prepare(`INSERT OR REPLACE INTO edges (source, target, kind, provenance_source, confidence, evidence, content_hash, created_at, call_end_line, call_end_col) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(edge.source, edge.target, edge.kind, edge.provenance.source, edge.provenance.confidence, edge.provenance.evidence, edge.provenance.content_hash, edge.created_at, edge.call_end?.line ?? null, edge.call_end?.col ?? null);
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
             e.content_hash as edge_hash, e.created_at, e.call_end_line, e.call_end_col
      FROM edges e
      JOIN nodes n ON n.id = ${joinOn}
      WHERE ${whereField} = ?`;
    // In the order the rows were written, which no index on `edges` holds: `idx_edges_key` reads them by target.
    const sql = `${kind ? `${baseSQL} AND e.kind = ?` : baseSQL} ORDER BY e.rowid`;
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
        edge: SqliteGraphStore.withCallEnd({
          source: row.source,
          target: row.target,
          kind: row.edge_kind,
          provenance: { source: row.provenance_source, confidence: row.confidence, evidence: row.evidence, content_hash: row.edge_hash },
          created_at: row.created_at,
        }, row),
      };
    });
  }

  private static withCallEnd(edge: GraphEdge, row: { call_end_line: number | null; call_end_col: number | null }): GraphEdge {
    if (row.call_end_line != null && row.call_end_col != null) edge.call_end = { line: row.call_end_line, col: row.call_end_col };
    return edge;
  }

  private static edgeFromRow(row: { source: string; target: string; kind: string; provenance_source: string; confidence: number; evidence: string; content_hash: string; created_at: number; call_end_line: number | null; call_end_col: number | null }): GraphEdge {
    return SqliteGraphStore.withCallEnd({
      source: row.source,
      target: row.target,
      kind: row.kind as GraphEdge["kind"],
      provenance: { source: row.provenance_source as GraphEdge["provenance"]["source"], confidence: row.confidence, evidence: row.evidence, content_hash: row.content_hash },
      created_at: row.created_at,
    }, row);
  }

  getUnresolvedEdges(): GraphEdge[] {
    const rows = this.db.prepare(`SELECT source, target, kind, provenance_source, confidence, evidence, content_hash, created_at, call_end_line, call_end_col FROM edges WHERE ${markerSql("target", UNRESOLVED)} ORDER BY created_at ASC`).all() as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  getEdgesBySource(sourceId: string): GraphEdge[] {
    const rows = this.db.prepare(`SELECT source, target, kind, provenance_source, confidence, evidence, content_hash, created_at, call_end_line, call_end_col FROM edges WHERE source = ? ORDER BY created_at ASC`).all(sourceId) as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  deleteEdge(source: string, target: string, kind: string, provenanceSource: string, callEnd?: GraphEdge["call_end"]): void {
    const key = [source, target, kind, provenanceSource];
    const site = callEnd ? " AND call_end_line = ? AND call_end_col = ?" : "";
    this.db.prepare(`DELETE FROM edges WHERE source = ? AND target = ? AND kind = ? AND provenance_source = ?${site}`).run(...key, ...(callEnd ? [callEnd.line, callEnd.col] : []));
  }

  getNodesByFile(file: string): GraphNode[] {
    const rows = this.db.prepare(`SELECT id, kind, name, file, start_line, end_line, content_hash, is_exported, signature FROM nodes WHERE file = ? ORDER BY start_line ASC, id ASC`).all(file) as Parameters<SqliteGraphStore["hydrateNode"]>[0][];
    return rows.map((row) => this.hydrateNode(row));
  }

  deleteFile(file: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM edges WHERE provenance_source NOT IN ('agent', 'coverage') AND (source IN (SELECT id FROM nodes WHERE file = ?) OR target IN (SELECT id FROM nodes WHERE file = ?))`).run(file, file);
      this.clearResolverMarkers();
      this.db.prepare(`DELETE FROM nodes WHERE file = ?`).run(file);
      this.db.prepare(`DELETE FROM file_hashes WHERE file = ?`).run(file);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  clearFile(file: string): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM edges WHERE provenance_source NOT IN ('agent', 'git', 'coverage') AND source IN (SELECT id FROM nodes WHERE file = ?)`).run(file);
      this.clearResolverMarkers();
      this.db.prepare(`DELETE FROM nodes WHERE file = ?`).run(file);
      this.db.prepare(`DELETE FROM file_hashes WHERE file = ?`).run(file);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** A changed file can add or drop a caller or implementation tsserver found for a symbol anywhere, so all markers go, and every failed query lookup. */
  private clearResolverMarkers(): void {
    this.db.prepare(`DELETE FROM graph_metadata WHERE SUBSTR(key, 1, ?) = ?`).run(RESOLVER_MARKER_PREFIX.length, RESOLVER_MARKER_PREFIX);
    this.db.prepare(`DELETE FROM failed_lookups WHERE kind IN ('references', 'implementations')`).run();
  }

  listFiles(): string[] {
    const rows = this.db.prepare("SELECT file FROM file_hashes ORDER BY file ASC").all() as Array<{ file: string }>;
    return rows.map((row) => row.file);
  }

  getFileHash(file: string): string | null {
    const row = this.db.prepare(`SELECT hash FROM file_hashes WHERE file = ? AND extractor_version >= ?`).get(file, SCHEMA_VERSION) as { hash: string } | null;
    return row?.hash ?? null;
  }

  setFileHash(file: string, hash: string, partial = false): void {
    this.db.prepare(`INSERT OR REPLACE INTO file_hashes (file, hash, indexed_at, partial, extractor_version) VALUES (?, ?, ?, ?, ?)`).run(file, hash, Date.now(), partial ? 1 : 0, SCHEMA_VERSION);
  }

  getStatistics(projectRoot?: string): GraphStatistics {
    const nodeRows = this.db.prepare("SELECT kind, COUNT(*) as cnt FROM nodes GROUP BY kind").all() as Array<{ kind: string; cnt: number }>;
    const nodes: Record<string, number> = {};
    for (const row of nodeRows) nodes[row.kind] = row.cnt;

    const edgeRows = this.db.prepare(`SELECT kind, provenance_source, COUNT(*) as cnt FROM edges WHERE NOT ${markerSql("target", MEMBER_CALL)} GROUP BY kind, provenance_source`).all() as Array<{ kind: string; provenance_source: string; cnt: number }>;
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
          stale++;
        }
      }
    }

    return { nodes, edges, files: { total, stale } };
  }

  clearCoverage(): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare(`DELETE FROM edges WHERE provenance_source = 'coverage'`).run();
      this.db.prepare(`DELETE FROM test_trace_steps`).run();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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

  getMetadata(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM graph_metadata WHERE key = ?`).get(key) as { value: string } | null;
    return row?.value ?? null;
  }

  setMetadata(key: string, value: string | null): void {
    if (value === null) this.db.prepare(`DELETE FROM graph_metadata WHERE key = ?`).run(key);
    else this.db.prepare(`INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)`).run(key, value);
  }

  getFailures(): RecordedFailure[] {
    return this.db.prepare(`SELECT kind, source, evidence FROM failed_lookups ORDER BY source, evidence, kind`).all() as RecordedFailure[];
  }

  getIndexErrors(): RecordedFailure[] {
    return this.db.prepare(`SELECT kind, source, evidence FROM failed_lookups WHERE kind = 'index' ORDER BY source, evidence`).all() as RecordedFailure[];
  }

  setFailed({ kind, source, evidence }: RecordedFailure, failed: boolean): void {
    if (failed) this.db.prepare(`INSERT OR IGNORE INTO failed_lookups (kind, source, evidence) VALUES (?, ?, ?)`).run(kind, source, evidence);
    else this.db.prepare(`DELETE FROM failed_lookups WHERE kind = ? AND source = ? AND evidence = ?`).run(kind, source, evidence);
  }
  hasCoverageData(): boolean {
    return this.getMetadata(COVERAGE_INDEXED_METADATA_KEY) === "1";
  }

  markCoverageIndexed(indexed = true): void {
    this.setMetadata(COVERAGE_INDEXED_METADATA_KEY, indexed ? "1" : null);
  }

  close(): void {
    this.db.close();
  }
}
