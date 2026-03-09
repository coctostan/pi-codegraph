import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when RETURN has no projections", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN'))
    .toThrowError(/query must contain exactly one RETURN clause/);
});
