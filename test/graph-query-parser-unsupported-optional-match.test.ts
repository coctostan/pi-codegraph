import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for OPTIONAL MATCH", () => {
  expect(() => parseGraphQuery('OPTIONAL MATCH (a {name: "foo"}) RETURN a'))
    .toThrowError(/OPTIONAL MATCH is not supported/);
});
