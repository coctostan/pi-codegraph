import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { createSignalComputer } from "../src/output/signals.js";

const _require = createRequire(import.meta.url);

function openRawDb(path: string): any {
  if ((process.versions as any).bun) {
    const { Database } = _require("bun:sqlite");
    return new Database(path);
  }
  const { DatabaseSync } = _require("node:sqlite");
  return new DatabaseSync(path);
}

function createLegacyDb(path: string): void {
  // Mirror the pre-#082 schema: every table that existed before graph_metadata
  // was added, but explicitly NOT graph_metadata.
  const raw = openRawDb(path);
  raw.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      file TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER,
      content_hash TEXT NOT NULL,
      is_exported INTEGER NOT NULL DEFAULT 0,
      signature TEXT
    );
    CREATE TABLE edges (
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
    CREATE TABLE file_hashes (
      file TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    );
    CREATE TABLE test_trace_steps (
      test_node_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      node_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      PRIMARY KEY (test_node_id, ordinal)
    );
    CREATE TABLE schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version(version) VALUES (1);
  `);
  raw.close();
}

test("SqliteGraphStore.hasCoverageData returns false on a legacy DB lacking graph_metadata (read-only mount)", () => {
  const dir = join(tmpdir(), `pi-cg-legacy-cov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");

  try {
    createLegacyDb(dbPath);
    // Lock the file AND the directory: when the dir is read-only sqlite
    // cannot create the journal files needed for `CREATE TABLE IF NOT EXISTS`
    // even though the statement is logically a no-op, so any read that
    // touches a missing table will surface "no such table".
    chmodSync(dbPath, 0o444);
    chmodSync(dir, 0o555);

    const store = new SqliteGraphStore(dbPath);
    try {
      // hasCoverageData must NOT throw on legacy DBs — a missing
      // graph_metadata table means coverage state is unknown, which is the
      // default "false" the signal layer expects.
      expect(() => store.hasCoverageData()).not.toThrow();
      expect(store.hasCoverageData()).toBe(false);

      // The downstream signal computer reads hasCoverageData eagerly during
      // construction; that path must stay alive too so signal-rendering tools
      // continue to work against pre-#082 graph databases.
      expect(() => createSignalComputer(store)).not.toThrow();
    } finally {
      store.close();
    }
  } finally {
    try { chmodSync(dir, 0o755); } catch {}
    try { chmodSync(dbPath, 0o644); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});
