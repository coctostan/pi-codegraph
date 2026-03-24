import { expect, test } from "bun:test";
import { extractGuards } from "../src/indexer/contract-extractor.js";

test("extractGuards finds if (!x) return pattern", () => {
  const code = `function foo(x: string) {
  if (!x) return;
  return x.toUpperCase();
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("!x");
});

test("extractGuards finds if (x == null) return pattern", () => {
  const code = `function foo(x: string) {
  if (x == null) return;
  return x;
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("x == null");
});

test("extractGuards finds if (x === undefined) return pattern", () => {
  const code = `function foo(x: string) {
  if (x === undefined) return;
  return x;
}`;
  const result = extractGuards(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("x === undefined");
});

test("extractGuards returns empty array when no guards", () => {
  const code = `function foo() { return 1; }`;
  const result = extractGuards(code, 1, 1);
  expect(result).toHaveLength(0);
});

test("extractGuards finds multiple guards", () => {
  const code = `function foo(x: string, y: number) {
  if (!x) return;
  if (y <= 0) return;
  return x.repeat(y);
}`;
  const result = extractGuards(code, 1, 5);
  expect(result).toHaveLength(2);
});
