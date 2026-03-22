import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery preserves STARTS WITH predicates in WHERE clauses", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name STARTS WITH "get" RETURN n.name LIMIT 4',
  );

  expect(ast.where).toEqual([
    { alias: "n", property: "name", operator: "STARTS WITH", value: "get" },
  ]);
  expect(ast.limit).toBe(4);
});
