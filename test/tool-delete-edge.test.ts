import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deleteEdge } from "../src/tools/delete-edge.js";

test("deleteEdge deletes an existing agent edge and returns confirmation", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  // Create an agent edge first
  store.addEdge({
    source: "src/a.ts::foo:1",
    target: "src/b.ts::bar:1",
    kind: "calls",
    provenance: { source: "agent", confidence: 0.7, evidence: "test evidence", content_hash: "h1" },
    created_at: Date.now(),
  });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Edge deleted:");
  expect(result).toContain("source:");
  expect(result).toContain("target:");
  expect(result).toContain("kind: calls");

  // Verify edge is actually gone
  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(0);

  store.close();
});

test("deleteEdge returns error when source symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::bar:1", kind: "function", name: "bar", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });

  const result = deleteEdge({
    source: "nonexistent",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});

test("deleteEdge returns error when target symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "nonexistent",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});

test("deleteEdge returns disambiguation list when source has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::foo:5", kind: "class", name: "foo", file: "src/b.ts", start_line: 5, end_line: 10, content_hash: "h2" });
  store.addNode({ id: "src/a.ts::bar:10", kind: "function", name: "bar", file: "src/a.ts", start_line: 10, end_line: 12, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous source");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("function");
  expect(result).toContain("class");
  expect(result).toContain("line 1");
  expect(result).toContain("line 5");

  store.close();
});

test("deleteEdge returns disambiguation list when target has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/a.ts::bar:5", kind: "function", name: "bar", file: "src/a.ts", start_line: 5, end_line: 7, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "class", name: "bar", file: "src/b.ts", start_line: 1, end_line: 10, content_hash: "h2" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous target");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("function");
  expect(result).toContain("class");

  store.close();
});

test("deleteEdge rejects invalid edge kinds", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/a.ts::bar:5", kind: "function", name: "bar", file: "src/a.ts", start_line: 5, end_line: 7, content_hash: "h1" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "invalid_kind",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Invalid edge kind");
  expect(result).toContain("invalid_kind");
  expect(result).toContain("calls");
  expect(result).toContain("imports");

  store.close();
});

test("deleteEdge returns not-found when no agent edge exists between symbols", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("No agent edge found");
  expect(result).toContain("foo");
  expect(result).toContain("bar");
  expect(result).toContain("calls");

  store.close();
});

test("deleteEdge reports not-found when only a non-agent edge exists", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  // Add a tree-sitter edge (non-agent)
  store.addEdge({
    source: "src/a.ts::foo:1",
    target: "src/b.ts::bar:1",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: "h1" },
    created_at: Date.now(),
  });

  const result = deleteEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("No agent edge found");

  // Verify the tree-sitter edge is still there
  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.source).toBe("tree-sitter");

  store.close();
});