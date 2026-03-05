import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveEdge } from "../src/tools/resolve-edge.js";

test("resolveEdge returns error when source symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::bar:1",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "nonexistent",
    target: "bar",
    kind: "calls",
    evidence: "test evidence",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});

test("resolveEdge returns error when target symbol not found", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "foo",
    target: "nonexistent",
    kind: "calls",
    evidence: "test evidence",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("not found");
  expect(result).toContain("nonexistent");

  store.close();
});

test("resolveEdge returns disambiguation list when source has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/b.ts::foo:5",
    kind: "class",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 10,
    content_hash: "h2",
  });
  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "test",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Ambiguous source");
  expect(result).toContain("src/a.ts");
  expect(result).toContain("function");
  expect(result).toContain("src/b.ts");
  expect(result).toContain("class");
  expect(result).toContain("line 1");
  expect(result).toContain("line 5");

  store.close();
});

test("resolveEdge returns disambiguation list when target has multiple matches", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/b.ts::bar:1",
    kind: "class",
    name: "bar",
    file: "src/b.ts",
    start_line: 1,
    end_line: 10,
    content_hash: "h2",
  });

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "test",
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

test("resolveEdge rejects invalid edge kinds", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/a.ts::bar:5",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h1",
  });

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "invalid_kind",
    evidence: "test",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Invalid edge kind");
  expect(result).toContain("invalid_kind");
  expect(result).toContain("calls");
  expect(result).toContain("imports");

  store.close();
});

test("resolveEdge creates edge with agent provenance and returns created confirmation", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });
  store.setFileHash("src/a.ts", "filehash_a");

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    sourceFile: "src/a.ts",
    targetFile: "src/b.ts",
    kind: "calls",
    evidence: "foo calls bar in the handler",
    store,
    projectRoot: "/tmp/test",
  });

  expect(result).toContain("Edge created:");
  expect(result).toContain("source:");
  expect(result).toContain("target:");
  expect(result).toContain("kind: calls");

  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  const edge = neighbors[0]!.edge;
  expect(edge.provenance.source).toBe("agent");
  expect(edge.provenance.confidence).toBe(0.7);
  expect(edge.provenance.evidence).toBe("foo calls bar in the handler");
  expect(edge.provenance.content_hash).toBe("filehash_a");

  store.close();
});

test("resolveEdge upserts same source→target→kind agent edge", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  store.setFileHash("src/a.ts", "hash_v1");
  const result1 = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "first evidence",
    store,
    projectRoot: "/tmp/test",
  });
  expect(result1).toContain("created");

  store.setFileHash("src/a.ts", "hash_v2");
  const result2 = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "updated evidence",
    store,
    projectRoot: "/tmp/test",
  });
  expect(result2).toContain("updated");

  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.evidence).toBe("updated evidence");
  expect(neighbors[0]!.edge.provenance.content_hash).toBe("hash_v2");

  store.close();
});