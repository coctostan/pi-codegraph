import { expect, test } from "bun:test";
import { BM25Index } from "../src/tools/bm25.js";

test("BM25Index scores exact name match highest", () => {
  const index = new BM25Index();
  index.addDocument("doc1", { name: "graphStore", signature: "class GraphStore", file: "src/graph/store.ts" });
  index.addDocument("doc2", { name: "addNode", signature: "addNode(node: GraphNode): void", file: "src/graph/sqlite.ts" });
  index.addDocument("doc3", { name: "getNode", signature: "getNode(id: string): GraphNode | null", file: "src/graph/sqlite.ts" });
  index.build();

  const results = index.search("graphStore");
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]!.id).toBe("doc1");
  expect(results[0]!.score).toBeGreaterThan(0);
});

test("BM25Index returns results sorted by score descending", () => {
  const index = new BM25Index();
  index.addDocument("a", { name: "foo", signature: "", file: "src/a.ts" });
  index.addDocument("b", { name: "fooBar", signature: "function fooBar(): void", file: "src/b.ts" });
  index.addDocument("c", { name: "baz", signature: "", file: "src/c.ts" });
  index.build();

  const results = index.search("foo");
  expect(results.length).toBeGreaterThan(1);
  for (let i = 1; i < results.length; i++) {
    expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
  }
});

test("BM25Index respects field weights: name > signature > file", () => {
  const index = new BM25Index();
  index.addDocument("nameHit", { name: "store", signature: "", file: "src/a.ts" });
  index.addDocument("sigHit", { name: "foo", signature: "function foo(store: Store): void", file: "src/b.ts" });
  index.addDocument("fileHit", { name: "bar", signature: "", file: "src/store/bar.ts" });
  index.build();

  const results = index.search("store");
  expect(results.length).toBe(3);
  expect(results[0]!.id).toBe("nameHit");
  expect(results[1]!.id).toBe("sigHit");
  expect(results[2]!.id).toBe("fileHit");
});

test("BM25Index multi-term query scores documents matching more terms higher", () => {
  const index = new BM25Index();
  index.addDocument("both", { name: "graphStore", signature: "", file: "src/a.ts" });
  index.addDocument("one", { name: "graphNode", signature: "", file: "src/b.ts" });
  index.build();

  const results = index.search("graph store");
  expect(results[0]!.id).toBe("both");
});

test("BM25Index returns empty array for query with no matches", () => {
  const index = new BM25Index();
  index.addDocument("a", { name: "foo", signature: "", file: "src/a.ts" });
  index.build();

  const results = index.search("zzzzNotExist");
  expect(results).toEqual([]);
});

test("BM25Index respects limit parameter", () => {
  const index = new BM25Index();
  for (let i = 0; i < 30; i++) {
    index.addDocument(`doc${i}`, { name: `foo${i}`, signature: "function foo", file: `src/${i}.ts` });
  }
  index.build();

  const results = index.search("foo", 5);
  expect(results.length).toBe(5);
});

test("BM25Index search returns empty for empty query", () => {
  const index = new BM25Index();
  index.addDocument("a", { name: "foo", signature: "", file: "src/a.ts" });
  index.build();

  expect(index.search("")).toEqual([]);
});
