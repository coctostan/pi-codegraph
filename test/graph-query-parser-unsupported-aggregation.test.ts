import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for aggregation", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN COUNT(a)'))
    .toThrowError(/aggregation is not supported/);
});
