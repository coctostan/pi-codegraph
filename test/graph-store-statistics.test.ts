import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";
import type { GraphNode, GraphEdge } from "../src/graph/types.js";

function makeNode(file: string, name: string, kind: GraphNode["kind"], line: number): GraphNode {
  return { id: nodeId(file, name, line), kind, name, file, start_line: line, end_line: line, content_hash: "abc123" };
}

function makeEdge(source: string, target: string, kind: GraphEdge["kind"], provSource: GraphEdge["provenance"]["source"]): GraphEdge {
  return {
    source,
    target,
    kind,
    provenance: { source: provSource, confidence: 0.5, evidence: "test", content_hash: "abc123" },
    created_at: Date.now(),
  };
}

test("getStatistics returns node counts grouped by kind", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode(makeNode("a.ts", "a.ts", "module", 1));
    store.addNode(makeNode("a.ts", "foo", "function", 2));
    store.addNode(makeNode("a.ts", "Bar", "class", 5));
    store.addNode(makeNode("b.ts", "b.ts", "module", 1));

    const stats = store.getStatistics();

    expect(stats.nodes.module).toBe(2);
    expect(stats.nodes.function).toBe(1);
    expect(stats.nodes.class).toBe(1);
  } finally {
    store.close();
  }
});

test("getStatistics returns edge counts grouped by kind and provenance source", () => {
  const store = new SqliteGraphStore();
  try {
    const modA = makeNode("a.ts", "a.ts", "module", 1);
    const modB = makeNode("b.ts", "b.ts", "module", 1);
    const fn = makeNode("a.ts", "foo", "function", 2);
    store.addNode(modA);
    store.addNode(modB);
    store.addNode(fn);

    store.addEdge(makeEdge(modA.id, "__unresolved__::x:0", "imports", "tree-sitter"));
    store.addEdge(makeEdge(fn.id, "__unresolved__::bar:0", "calls", "tree-sitter"));
    store.addEdge(makeEdge(fn.id, modB.id, "calls", "lsp"));

    const stats = store.getStatistics();

    expect(stats.edges["imports"]["tree-sitter"]).toBe(1);
    expect(stats.edges["calls"]["tree-sitter"]).toBe(1);
    expect(stats.edges["calls"]["lsp"]).toBe(1);
  } finally {
    store.close();
  }
});

test("getStatistics returns file counts (total tracked)", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode(makeNode("a.ts", "a.ts", "module", 1));
    store.addNode(makeNode("b.ts", "b.ts", "module", 1));
    store.setFileHash("a.ts", "hash1");
    store.setFileHash("b.ts", "hash2");

    const stats = store.getStatistics();

    expect(stats.files.total).toBe(2);
  } finally {
    store.close();
  }
});
