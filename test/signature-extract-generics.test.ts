import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for generic function", () => {
  const code = "function identity<T>(value: T): T { return value; }";
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<T>(value: T) => T");
});

test("extractFile produces signature for generic function with constraint", () => {
  const code = 'function query<T extends Record<string, unknown>>(items: T[]): T { return items[0]; }';
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<T extends Record<string, unknown>>(items: T[]) => T");
});

test("extractFile produces signature for generic arrow function", () => {
  const code = "const wrap = <T>(value: T): T[] => [value];";
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<T>(value: T) => T[]");
});

test("extractFile produces signature for multi-type-param function", () => {
  const code = "function map<K, V>(key: K, value: V): [K, V] { return [key, value]; }";
  const result = extractFile("src/a.ts", code);
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("<K, V>(key: K, value: V) => [K, V]");
});
