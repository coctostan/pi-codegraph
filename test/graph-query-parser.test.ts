import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery parses one MATCH chain with filters, WHERE, RETURN projections, and LIMIT", () => {
  const ast = parseGraphQuery(
    'MATCH (a {kind: "function", name: "foo"})-[r:calls]->(b {kind: "function"}) WHERE a.name = "foo" AND b.name = "bar" RETURN a, r, b.file LIMIT 5',
  );

  expect(ast.match.left.alias).toBe("a");
  expect(ast.match.left.filters).toEqual({ kind: "function", name: "foo" });
  expect(ast.match.edge).toEqual({ alias: "r", kind: "calls", direction: "out" });
  expect(ast.match.right).toEqual({ alias: "b", filters: { kind: "function" } });
  expect(ast.where).toEqual([
    { alias: "a", property: "name", value: "foo" },
    { alias: "b", property: "name", value: "bar" },
  ]);
  expect(ast.returns).toEqual([
    { kind: "alias", alias: "a" },
    { kind: "alias", alias: "r" },
    { kind: "property", alias: "b", property: "file" },
  ]);
  expect(ast.limit).toBe(5);
});
