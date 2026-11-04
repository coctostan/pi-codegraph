import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { createSignalComputer } from "../src/output/signals.js";
import { evaluateFreshness } from "../src/output/freshness.js";

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
    INSERT INTO nodes VALUES ('src/a.ts::f:1', 'function', 'f', 'src/a.ts', 1, 1, 'h', 0, NULL);
    INSERT INTO nodes VALUES ('src/a.ts::g:2', 'function', 'g', 'src/a.ts', 2, 2, 'h', 0, NULL);
    INSERT INTO edges VALUES ('src/a.ts::f:1', 'src/a.ts::g:2', 'calls', 'tree-sitter', 0.5, 'g:1:20', 'h', 1);
  `);
  raw.close();
}

function withLegacyDb(fn: (dbPath: string) => void): void {
  const dir = join(tmpdir(), `pi-cg-legacy-cov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");

  try {
    createLegacyDb(dbPath);
    fn(dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a legacy DB lacking graph_metadata migrates on open and reads as one without coverage", () => {
  withLegacyDb((dbPath) => {
    const store = new SqliteGraphStore(dbPath);
    try {
      expect(store.hasCoverageData()).toBe(false);
      expect(() => createSignalComputer(store)).not.toThrow();

      // It gains file_hashes.partial, so the Trust note names no partial file.
      const node = { id: "src/a.ts::f:1", kind: "function" as const, name: "f", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" };
      expect(evaluateFreshness({ store, projectRoot: tmpdir(), targetNodes: [node] }).partialFiles).toEqual([]);

      // And `edges.call_end_*`: its edges read back without a call site.
      expect(store.getEdgesBySource("src/a.ts::f:1").map((e) => [e.target, e.call_end])).toEqual([["src/a.ts::g:2", undefined]]);
      expect(store.getUnresolvedEdges()).toEqual([]);
      expect(store.getNeighbors("src/a.ts::g:2", { direction: "in" }).map((n) => n.node.id)).toEqual(["src/a.ts::f:1"]);
      expect(store.getFailedLookups()).toEqual([]);
    } finally {
      store.close();
    }
  });
});

// pi's host runs on Node, whose node:sqlite runs the migration too.
test.skipIf(!Bun.which("node"))("SqliteGraphStore migrates a legacy DB under Node", () => {
  withLegacyDb((dbPath) => {
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
    expect(() => new SqliteGraphStore(dbPath)).toThrow(/not a database/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
