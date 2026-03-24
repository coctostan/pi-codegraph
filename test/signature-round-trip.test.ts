import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";

test("signature round-trips through findNodes", () => {
  const store = new SqliteGraphStore();
  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: true,
    signature: "(x: string, y: number) => boolean",
  };
  store.addNode(node);

  const found = store.findNodes("foo");
  expect(found).toHaveLength(1);
  expect(found[0]!.signature).toBe("(x: string, y: number) => boolean");

  const foundByFile = store.findNodes("foo", "src/a.ts");
  expect(foundByFile).toHaveLength(1);
  expect(foundByFile[0]!.signature).toBe("(x: string, y: number) => boolean");
});

test("signature round-trips through getNodesByFile", () => {
  const store = new SqliteGraphStore();
  const node: GraphNode = {
    id: "src/a.ts::bar:5",
    kind: "class",
    name: "bar",
    file: "src/a.ts",
    start_line: 5,
    end_line: 10,
    content_hash: "h2",
    is_exported: false,
    signature: "class bar extends Base { constructor(name: string) }",
  };
  store.addNode(node);

  const fileNodes = store.getNodesByFile("src/a.ts");
  expect(fileNodes).toHaveLength(1);
  expect(fileNodes[0]!.signature).toBe("class bar extends Base { constructor(name: string) }");
});

test("signature round-trips through getNeighbors", () => {
  const store = new SqliteGraphStore();
  const n1: GraphNode = {
    id: "src/a.ts::caller:1",
    kind: "function",
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
    is_exported: false,
    signature: "(x: number) => void",
  };
  const n2: GraphNode = {
    id: "src/a.ts::callee:5",
    kind: "function",
    name: "callee",
    file: "src/a.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
    is_exported: false,
    signature: "(y: string) => boolean",
  };
  store.addNode(n1);
  store.addNode(n2);
  store.addEdge({
    source: n1.id,
    target: n2.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "test", content_hash: "h1" },
    created_at: Date.now(),
  });

  const neighbors = store.getNeighbors(n1.id, { direction: "out" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.node.signature).toBe("(y: string) => boolean");
});

test("nodes without signature have undefined signature field", () => {
  const store = new SqliteGraphStore();
  const node: GraphNode = {
    id: "src/a.ts::mod:1",
    kind: "module",
    name: "src/a.ts",
    file: "src/a.ts",
    start_line: 1,
    end_line: 10,
    content_hash: "h1",
    is_exported: false,
  };
  store.addNode(node);

  const retrieved = store.getNode(node.id);
  expect(retrieved).not.toBeNull();
  expect(retrieved!.signature).toBeUndefined();
  expect("signature" in retrieved!).toBe(false);
});
