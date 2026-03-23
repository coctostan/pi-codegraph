import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery converts store execution failures into execution_error output", () => {
  const fakeStore = {
    queryRows() {
      throw new Error("sqlite busy");
    },
    getStatistics() {
      return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "hello"}) RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain("## Trust");
  expect(output).toContain("execution_error: sqlite busy");
});
