import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unsupported projection properties", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN a.missing'))
    .toThrowError(/property "missing" is not allowed on alias "a"/);
});
