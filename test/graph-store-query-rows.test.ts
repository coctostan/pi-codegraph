import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.queryRows executes parameterized SELECT queries", () => {
  const store = new SqliteGraphStore();

  store.addNode({
    id: "src/a.ts::alpha:1",
    kind: "function",
    name: "alpha",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h1",
  });
  store.addNode({
    id: "src/b.ts::beta:1",
    kind: "class",
    name: "beta",
    file: "src/b.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h2",
  });

  const rows = store.queryRows<{ id: string; name: string }>(
    "SELECT id, name FROM nodes WHERE kind = ? ORDER BY id ASC",
    ["function"],
  );

  expect(rows).toEqual([
    { id: "src/a.ts::alpha:1", name: "alpha" },
  ]);

  expect(() => store.queryRows("DELETE FROM nodes", [])).toThrow(
    "queryRows only supports SELECT statements",
  );

  store.close();
});
