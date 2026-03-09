import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery accepts node filters whose values contain mutation keywords", () => {
  // Searching for a node named "create" or "set" is a valid read-only query.
  // The mutation check must not match keyword-like strings inside quoted values.
  expect(() => parseGraphQuery('MATCH (a {name: "create"}) RETURN a')).not.toThrow();
  expect(() => parseGraphQuery('MATCH (a {name: "delete"}) RETURN a')).not.toThrow();
  expect(() => parseGraphQuery('MATCH (a {name: "merge"}) RETURN a')).not.toThrow();
  expect(() => parseGraphQuery('MATCH (a {name: "set"}) RETURN a')).not.toThrow();
});
