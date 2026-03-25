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

test("symbolSearch cache invalidates when graph changes", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::fooBar:1", name: "fooBar", file: "src/a.ts" });

    const output1 = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    expect(output1).toContain("fooBar");

    const output2 = symbolSearch({ query: "bazQux", store, projectRoot: "/tmp/test" });
    expect(output2).toContain("No results");

    addTestNode(store, { id: "src/b.ts::bazQux:1", name: "bazQux", file: "src/b.ts" });

    const output3 = symbolSearch({ query: "bazQux", store, projectRoot: "/tmp/test" });
    expect(output3).toContain("bazQux");
    expect(output3).toContain("src/b.ts");
  } finally {
    store.close();
  }
});

test("symbolSearch cache reuses index when graph unchanged", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::alphaOne:1", name: "alphaOne", file: "src/a.ts" });
    addTestNode(store, { id: "src/b.ts::betaTwo:1", name: "betaTwo", file: "src/b.ts" });

    const output1 = symbolSearch({ query: "alpha", store, projectRoot: "/tmp/test" });
    expect(output1).toContain("alphaOne");

    const output2 = symbolSearch({ query: "beta", store, projectRoot: "/tmp/test" });
    expect(output2).toContain("betaTwo");
  } finally {
    store.close();
  }
});
