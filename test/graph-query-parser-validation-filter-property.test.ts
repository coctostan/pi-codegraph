import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unsupported node filter properties", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {file: "src/a.ts"}) RETURN a'),
  ).toThrowError(/property "file" is not allowed on node alias "a"/);
});
