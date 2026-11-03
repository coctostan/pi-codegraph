import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphEdge } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

const SOURCE = [
  'import * as ns from "./ns";',
  "export function caller() {",
  "  a(b());",
  "  new C();",
  "  ns.d();",
  "  a();",
  "}",
  "export function nested() {",
  "  f(f(1));",
  "}",
].join("\n");

test("each calls edge carries where its call ends, a repeated callee keeping the call that ends first", () => {
  const calls = extractFile("src/x.ts", SOURCE).edges.filter((e) => e.kind === "calls");
  const rows = calls.map((e) => [e.source.split("::")[1], e.target.split("::")[1], e.provenance.evidence, e.call_end]);
  expect(rows).toEqual([
    ["caller:2", "a:0", "a:3:3", { line: 3, col: 8 }],
    ["caller:2", "b:0", "b:3:5", { line: 3, col: 7 }],
    ["caller:2", "C:0", "C:4:7", { line: 4, col: 9 }],
    ["caller:2", "d:0", "d:5:6", { line: 5, col: 8 }],
    ["nested:8", "f:0", "f:9:5", { line: 9, col: 8 }],
  ]);
});

test("the store returns call_end from every edge read, and none for an edge without it", () => {
  const store = new SqliteGraphStore();
  try {
    const edge = (target: string, call_end?: GraphEdge["call_end"]): GraphEdge => ({
      source: "src/x.ts::caller:1",
      target,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "e:1:1", content_hash: "h" },
      created_at: 1,
      ...(call_end ? { call_end } : {}),
    });
    store.addNode({ id: "src/x.ts::caller:1", kind: "function", name: "caller", file: "src/x.ts", start_line: 1, end_line: 3, content_hash: "h" });
    store.addNode({ id: "src/x.ts::callee:5", kind: "function", name: "callee", file: "src/x.ts", start_line: 5, end_line: 6, content_hash: "h" });
    store.addEdge(edge("__unresolved__::gone:0", { line: 2, col: 9 }));
    store.addEdge(edge("src/x.ts::callee:5"));

    expect(store.getUnresolvedEdges()[0]!.call_end).toEqual({ line: 2, col: 9 });
    expect(store.getEdgesBySource("src/x.ts::caller:1").map((e) => e.call_end)).toEqual([{ line: 2, col: 9 }, undefined]);
    expect("call_end" in store.getNeighbors("src/x.ts::callee:5", { direction: "in" })[0]!.edge).toBe(false);
    store.addEdge(edge("src/x.ts::callee:5", { line: 3, col: 4 }));
    expect(store.getNeighbors("src/x.ts::callee:5", { direction: "in" })[0]!.edge.call_end).toEqual({ line: 3, col: 4 });
  } finally {
    store.close();
  }
});

test("a db indexed before edges.call_end gains the columns and re-extracts every file once", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-call-end-upgrade-"));
  const dbPath = join(root, "graph.db");
  try {
    const old = new SqliteGraphStore(dbPath);
    old.setFileHash("src/x.ts", "h");
    old.close();
    const raw = new Database(dbPath);
    // Such a db predates schema_version 2, which landed after edges.call_end.
    raw.run("ALTER TABLE edges DROP COLUMN call_end_line");
    raw.run("ALTER TABLE edges DROP COLUMN call_end_col");
    raw.run("UPDATE schema_version SET version = 1");
    raw.close();

    new SqliteGraphStore(dbPath).close();
    const after = new Database(dbPath);
    try {
      const columns = (after.prepare("PRAGMA table_info(edges)").all() as Array<{ name: string }>).map((c) => c.name);
      expect(columns).toContain("call_end_line");
      expect(columns).toContain("call_end_col");
      expect(after.prepare("SELECT hash FROM file_hashes").all()).toEqual([{ hash: "" }]);
    } finally {
      after.close();
    }

    const reopened = new SqliteGraphStore(dbPath);
    reopened.setFileHash("src/x.ts", "h2");
    reopened.close();
    const again = new SqliteGraphStore(dbPath);
    try {
      expect(again.getFileHash("src/x.ts")).toBe("h2");
    } finally {
      again.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
