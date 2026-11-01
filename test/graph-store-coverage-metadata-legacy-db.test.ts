import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

function withReadOnlyLegacyDb(fn: (dbPath: string) => void): void {
  const dir = join(tmpdir(), `pi-cg-legacy-cov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");

  try {
    createLegacyDb(dbPath);
    // Lock the file AND the directory: `CREATE TABLE IF NOT EXISTS` on the
    // missing graph_metadata table is a real write, which sqlite refuses with
    // SQLITE_READONLY, so the store must open without migrating.
    chmodSync(dbPath, 0o444);
    chmodSync(dir, 0o555);
    fn(dbPath);
  } finally {
    try { chmodSync(dir, 0o755); } catch {}
    try { chmodSync(dbPath, 0o644); } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
}

test("SqliteGraphStore.hasCoverageData returns false on a legacy DB lacking graph_metadata (read-only mount)", () => {
  withReadOnlyLegacyDb((dbPath) => {
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
  });
});

// pi's host runs on Node, whose node:sqlite reports the error code in `errcode`, not Bun's `errno`.
test.skipIf(!Bun.which("node"))("SqliteGraphStore opens a read-only legacy DB under Node", () => {
  withReadOnlyLegacyDb((dbPath) => {
    const script = `const { SqliteGraphStore } = await import(process.argv[1]); const s = new SqliteGraphStore(process.argv[2]); console.log(s.hasCoverageData()); s.close();`;
    const sqliteUrl = new URL("../src/graph/sqlite.ts", import.meta.url).href;
    const run = spawnSync("node", ["--input-type=module", "-e", script, sqliteUrl, dbPath], { encoding: "utf8" });
    expect(run.stderr).not.toContain("Error");
    expect(run.stdout.trim()).toBe("false");
  });
});

test("SqliteGraphStore still throws when the file is not a database", () => {
  const dir = join(tmpdir(), `pi-cg-notadb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");
  try {
    writeFileSync(dbPath, "x".repeat(4096));
    // Only a read-only DB may skip the migration; any other open failure surfaces.
    expect(() => new SqliteGraphStore(dbPath)).toThrow(/not a database/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
