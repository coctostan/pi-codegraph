import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when a query contains multiple MATCH clauses", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) MATCH (b {name: "bar"}) RETURN a'),
  ).toThrowError(/query must contain exactly one MATCH clause/);
});
