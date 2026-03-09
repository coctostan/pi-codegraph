import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error when WHERE references an alias not declared in MATCH", () => {
  // 'z' is not declared in MATCH — should be a validation_error, not silently broken SQL.
  expect(() => parseGraphQuery('MATCH (a {name: "hello"}) WHERE z.name = "foo" RETURN a'))
    .toThrowError(/alias "z" is not bound/);
});
