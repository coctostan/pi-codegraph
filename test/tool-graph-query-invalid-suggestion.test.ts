import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

const fakeStore = {
  getStatistics() {
    return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
  },
} as any;

test("graphQuery suggests a valid WHERE predicate after a parse error", () => {
  const output = graphQuery({
    query: 'MATCH (a) WHERE a.name ~= "foo" RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain('parse_error: invalid WHERE predicate: a.name ~= "foo"');
  expect(output).toContain('try instead: MATCH (a) WHERE a.name = "foo" RETURN a');
});

test("graphQuery suggests a supported projection property after a validation error", () => {
  const output = graphQuery({
    query: 'MATCH (a {name: "foo"}) RETURN a.missing',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain('validation_error: property "missing" is not allowed on alias "a"');
  expect(output).toContain('try instead: RETURN a.name');
});
