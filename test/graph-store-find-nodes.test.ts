import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("findNodes returns all nodes matching a name across files", () => {
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
    kind: "function",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
  });

  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    content_hash: "h3",
  });

  const results = store.findNodes("foo");
  expect(results).toHaveLength(2);
  expect(results.map((n) => n.id).sort()).toEqual([
    "src/a.ts::foo:1",
    "src/b.ts::foo:5",
  ]);

  store.close();
});

test("findNodes returns empty array for nonexistent name", () => {
  const store = new SqliteGraphStore();
  const results = store.findNodes("nonexistent");
  expect(results).toEqual([]);
  store.close();
});


test("findNodes filters by file when file parameter is provided", () => {
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
    kind: "function",
    name: "foo",
    file: "src/b.ts",
    start_line: 5,
    end_line: 7,
    content_hash: "h2",
  });

  const results = store.findNodes("foo", "src/a.ts");
  expect(results).toHaveLength(1);
  expect(results[0]!.id).toBe("src/a.ts::foo:1");

  store.close();
});
