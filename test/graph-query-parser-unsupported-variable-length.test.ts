import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for variable-length paths", () => {
  expect(() => parseGraphQuery('MATCH (a)-[*]->(b) RETURN a'))
    .toThrowError(/variable-length paths are not supported/);
});
