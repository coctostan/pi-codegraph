import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for OR", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) WHERE a.name = "foo" OR a.kind = "function" RETURN a'))
    .toThrowError(/OR is not supported/);
});
