import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unbound aliases", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN b'))
    .toThrowError(/alias "b" is not bound/);
});
