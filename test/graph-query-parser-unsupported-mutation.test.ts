import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for mutating queries", () => {
  expect(() => parseGraphQuery('CREATE (a {name: "foo"}) RETURN a'))
    .toThrowError(/mutating queries are not supported/);
});
