// Task 4: Filter tests
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

test("symbolSearch kind filter excludes non-matching kinds", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::graphStore:1", name: "graphStore", file: "src/a.ts", kind: "class" });
    addTestNode(store, { id: "src/b.ts::graphNode:1", name: "graphNode", file: "src/b.ts", kind: "interface" });
    addTestNode(store, { id: "src/c.ts::getGraph:1", name: "getGraph", file: "src/c.ts", kind: "function" });

    const output = symbolSearch({ query: "graph", kind: "class", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).not.toContain("graphNode");
    expect(output).not.toContain("getGraph");
  } finally {
    store.close();
  }
});

test("symbolSearch file glob filter narrows results", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/graph/store.ts::graphStore:1", name: "graphStore", file: "src/graph/store.ts" });
    addTestNode(store, { id: "src/tools/foo.ts::graphQuery:1", name: "graphQuery", file: "src/tools/foo.ts" });

    const output = symbolSearch({ query: "graph", file: "src/graph/**", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).not.toContain("graphQuery");
  } finally {
    store.close();
  }
});

test("symbolSearch kind filter with no matches returns empty", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::fooBar:1", name: "fooBar", file: "src/a.ts", kind: "function" });

    const output = symbolSearch({ query: "foo", kind: "class", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch file glob filter with no matches returns empty", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::fooBar:1", name: "fooBar", file: "src/a.ts" });

    const output = symbolSearch({ query: "foo", file: "lib/**", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});
