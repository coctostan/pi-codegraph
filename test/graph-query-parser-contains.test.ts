import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery preserves CONTAINS predicates in WHERE clauses", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name CONTAINS "Handler" RETURN n.name LIMIT 2',
  );

  expect(ast.where).toEqual([
    { alias: "n", property: "name", operator: "CONTAINS", value: "Handler" },
  ]);
  expect(ast.limit).toBe(2);
});
