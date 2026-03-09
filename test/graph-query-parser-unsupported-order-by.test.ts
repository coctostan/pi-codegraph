import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for ORDER BY", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN a ORDER BY a.name'))
    .toThrowError(/ORDER BY is not supported/);
});
