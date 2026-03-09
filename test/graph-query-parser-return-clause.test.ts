import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when a query contains duplicate RETURN clauses", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) RETURN a RETURN a.name'),
  ).toThrowError(/query must contain exactly one RETURN clause/);
});
