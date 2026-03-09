import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery converts store execution failures into execution_error output", () => {
  const fakeStore = {
    queryRows() {
      throw new Error("sqlite busy");
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "hello"}) RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toBe("execution_error: failed to execute compiled query\n");
});
