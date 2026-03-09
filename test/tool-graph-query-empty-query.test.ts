import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery rejects blank query strings with parse_error", () => {
  const store = new SqliteGraphStore();
  try {
    const output = graphQuery({
      query: "   \n\t  ",
      store,
      projectRoot: "/tmp/project",
    });

    expect(output).toBe("parse_error: query must not be empty\n");
  } finally {
    store.close();
  }
});
