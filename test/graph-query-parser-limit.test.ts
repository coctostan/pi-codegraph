import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when LIMIT is non-positive", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) RETURN a LIMIT 0'),
  ).toThrowError(/LIMIT must be a positive integer/);

  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) RETURN a LIMIT -1'),
  ).toThrowError(/LIMIT must be a positive integer/);
});
