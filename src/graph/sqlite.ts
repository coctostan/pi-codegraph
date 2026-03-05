import { Database } from "bun:sqlite";

import type { GraphStore, NeighborOptions, NeighborResult } from "./store.js";
import type { GraphEdge, GraphNode } from "./types.js";

/** Raw row returned by the directional neighbor SELECT queries. */
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

  addEdge(edge: GraphEdge): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO edges
          (source, target, kind, provenance_source, confidence, evidence, content_hash, created_at)
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

  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[] {
    const direction = options?.direction ?? "both";
    const kind = options?.kind;
    if (direction === "out") return this.fetchNeighborRows(nodeId, "out", kind);
    if (direction === "in") return this.fetchNeighborRows(nodeId, "in", kind);
    return [
      ...this.fetchNeighborRows(nodeId, "out", kind),
      ...this.fetchNeighborRows(nodeId, "in", kind),
    ];
  }

  /**
   * Execute a single-direction neighbor query and map rows to NeighborResult[].
   * `joinOn` and `whereField` are fixed SQL column references derived from the
   * direction enum — they are internal constants, not user input.
   */
  private fetchNeighborRows(
    nodeId: string,
    direction: "in" | "out",
    kind?: GraphEdge["kind"]
  ): NeighborResult[] {
    const [joinOn, whereField] =
      direction === "out"
        ? ["e.target", "e.source"]
        : ["e.source", "e.target"];

    const baseSQL = `
      SELECT n.id, n.kind, n.name, n.file, n.start_line, n.end_line, n.content_hash,
             e.source, e.target, e.kind as edge_kind,
             e.provenance_source, e.confidence, e.evidence,
             e.content_hash as edge_hash, e.created_at
      FROM edges e
      JOIN nodes n ON n.id = ${joinOn}
      WHERE ${whereField} = ?`;

    const sql = kind ? `${baseSQL} AND e.kind = ?` : baseSQL;

    const rows = (kind
      ? this.db.query(sql).all(nodeId, kind)
      : this.db.query(sql).all(nodeId)) as NeighborRow[];

    return rows.map((row) => ({
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
          source: row.provenance_source,
          confidence: row.confidence,
          evidence: row.evidence,
          content_hash: row.edge_hash,
        },
        created_at: row.created_at,
      },
    }));
  }

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

  listFiles(): string[] {
    const rows = this.db
      .query("SELECT file FROM file_hashes ORDER BY file ASC")
      .all() as Array<{ file: string }>;

    return rows.map((r) => r.file);
  }

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

  close(): void {
    this.db.close();
  }
}
