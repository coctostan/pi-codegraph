import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";

test("GraphNode signature field exists and SQLite column is nullable", () => {
  const store = new SqliteGraphStore();

  const nodeWithSig: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: false,
    signature: "(x: string) => number",
  };

  store.addNode(nodeWithSig);
  const retrieved = store.getNode(nodeWithSig.id);
  expect(retrieved).not.toBeNull();
  expect(retrieved!.signature).toBe("(x: string) => number");

  // Node without signature — should round-trip as undefined
  const nodeWithoutSig: GraphNode = {
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
    is_exported: false,
  };

  store.addNode(nodeWithoutSig);
  const retrieved2 = store.getNode(nodeWithoutSig.id);
  expect(retrieved2).not.toBeNull();
  expect(retrieved2!.signature).toBeUndefined();
});

test("signature column is added via migration on existing databases", () => {
  const dir = join(tmpdir(), "pi-codegraph-tests");
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, `sig-migration-${Date.now()}.sqlite`);

  try {
    // Create a DB with the old schema (no signature column)
    const rawDb = new Database(dbPath);
    rawDb.run(`CREATE TABLE nodes (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
        file TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER,
        content_hash TEXT NOT NULL, is_exported INTEGER NOT NULL DEFAULT 0
      )`);
    rawDb.run(`CREATE TABLE edges (
        source TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL,
        provenance_source TEXT NOT NULL, confidence REAL NOT NULL,
        evidence TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
        PRIMARY KEY (source, target, kind, provenance_source)
      )`);
    rawDb.run(`CREATE TABLE file_hashes (file TEXT PRIMARY KEY, hash TEXT NOT NULL, indexed_at INTEGER NOT NULL)`);
    rawDb.run(`CREATE TABLE test_trace_steps (
        test_node_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        node_id TEXT NOT NULL, content_hash TEXT NOT NULL,
        PRIMARY KEY (test_node_id, ordinal)
      )`);
    rawDb.run(`CREATE TABLE schema_version (version INTEGER NOT NULL)`);
    rawDb.run(`INSERT INTO schema_version(version) VALUES (1)`);
    rawDb.close();

    // Opening with SqliteGraphStore should migrate
    const store = new SqliteGraphStore(dbPath);
    const node: GraphNode = {
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "h1",
      is_exported: false,
      signature: "(x: string) => void",
    };
    store.addNode(node);
    expect(store.getNode(node.id)!.signature).toBe("(x: string) => void");
    store.close();
  } finally {
    rmSync(dbPath, { force: true });
  }
});
