import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery returns a deterministic suggestion for unsupported ORDER BY queries", () => {
  const fakeStore = {
    getStatistics() {
      return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "foo"}) RETURN a ORDER BY a.name',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain("unsupported_error: ORDER BY is not supported");
  expect(output).toContain('try instead: MATCH (a {name: "foo"}) RETURN a LIMIT 10');
});
