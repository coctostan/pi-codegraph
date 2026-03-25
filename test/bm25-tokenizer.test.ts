import { expect, test } from "bun:test";
import { tokenize } from "../src/tools/bm25.js";

test("tokenize splits camelCase into lowercase terms", () => {
  expect(tokenize("getNodesByFile")).toEqual(["get", "nodes", "by", "file"]);
});

test("tokenize splits snake_case into lowercase terms", () => {
  expect(tokenize("content_hash")).toEqual(["content", "hash"]);
});

test("tokenize splits whitespace", () => {
  expect(tokenize("graph store")).toEqual(["graph", "store"]);
});

test("tokenize handles mixed camelCase, snake_case, and whitespace", () => {
  expect(tokenize("myFunc_name here")).toEqual(["my", "func", "name", "here"]);
});

test("tokenize lowercases all terms", () => {
  expect(tokenize("GraphStore")).toEqual(["graph", "store"]);
});

test("tokenize returns empty array for empty string", () => {
  expect(tokenize("")).toEqual([]);
});

test("tokenize handles single word", () => {
  expect(tokenize("foo")).toEqual(["foo"]);
});

test("tokenize handles all-uppercase abbreviations", () => {
  expect(tokenize("parseJSON")).toEqual(["parse", "json"]);
});
