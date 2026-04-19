import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { collectNaiveFiles } from "../src/tools/token-tracker.js";
import { isRemoved } from "./phase5-decision-matrix.js";

test("collectNaiveFiles for symbol_graph returns target + neighbor files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });
    const files = collectNaiveFiles("symbol_graph", { name: "foo" }, store);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  } finally { store.close(); }
});

test("collectNaiveFiles for impact returns downstream files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/b.ts::bar:1", target: "src/a.ts::foo:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h2" }, created_at: Date.now() });
    const files = collectNaiveFiles("impact", { symbols: ["foo"] }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally { store.close(); }
});

if (!isRemoved("graph_overview")) {
  test("collectNaiveFiles for graph_overview returns all indexed files", () => {
    const store = new SqliteGraphStore();
    try {
      store.setFileHash("src/a.ts", "h1");
      store.setFileHash("src/b.ts", "h2");
      const files = collectNaiveFiles("graph_overview", {}, store);
      expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
    } finally { store.close(); }
  });
}

test("collectNaiveFiles for trace returns traced path files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::entry:1", kind: "function", name: "entry", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::callee:1", kind: "function", name: "callee", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::entry:1", target: "src/b.ts::callee:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });
    const files = collectNaiveFiles("trace", { entry: "entry" }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally { store.close(); }
});
