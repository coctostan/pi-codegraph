import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";
import type { GraphNode } from "../src/graph/types.js";

function addTestNode(store: SqliteGraphStore, overrides: Partial<GraphNode> & { id: string; name: string; file: string }): void {
  store.addNode({
    kind: "function",
    start_line: 1,
    end_line: 10,
    content_hash: "abc123",
    is_exported: true,
    ...overrides,
  });
  store.setFileHash(overrides.file, "hash1");
}

test("symbolSearch returns ranked results for a partial name match", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::graphStore:1", name: "graphStore", file: "src/a.ts", signature: "class GraphStore" });
    addTestNode(store, { id: "src/b.ts::addNode:1", name: "addNode", file: "src/b.ts", signature: "addNode(node: GraphNode): void" });
    addTestNode(store, { id: "src/c.ts::getNode:1", name: "getNode", file: "src/c.ts", signature: "getNode(id: string): GraphNode" });

    const output = symbolSearch({ query: "graph store", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("function");
  } finally {
    store.close();
  }
});

test("symbolSearch returns empty for no matches", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "zzzzNotExist", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch returns empty for empty query", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch includes signature when present", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:5", name: "foo", file: "src/a.ts", signature: "function foo(x: number): string" });

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    expect(output).toContain("function foo(x: number): string");
  } finally {
    store.close();
  }
});

test("symbolSearch respects limit parameter", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    for (let i = 0; i < 10; i++) {
      addTestNode(store, { id: `src/${i}.ts::fooItem${i}:1`, name: `fooItem${i}`, file: `src/${i}.ts` });
    }

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test", limit: 3 });
    const matches = output.split("\n").filter((line) => /^\d+\./.test(line.trim()));
    expect(matches.length).toBe(3);
  } finally {
    store.close();
  }
});

test("symbolSearch default limit is 20", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    for (let i = 0; i < 30; i++) {
      addTestNode(store, { id: `src/${i}.ts::fooItem${i}:1`, name: `fooItem${i}`, file: `src/${i}.ts` });
    }

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    const matches = output.split("\n").filter((line) => /^\d+\./.test(line.trim()));
    expect(matches.length).toBe(20);
  } finally {
    store.close();
  }
});
