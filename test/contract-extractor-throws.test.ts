import { expect, test } from "bun:test";
import { extractThrows } from "../src/indexer/contract-extractor.js";

test("extractThrows finds throw new Error with string literal", () => {
  const code = `function foo() {
  if (!x) throw new Error("missing x");
  return x;
}`;
  const result = extractThrows(code, 1, 4);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("missing x");
});

test("extractThrows finds throw new CustomError", () => {
  const code = `function foo() {
  throw new ValidationError("bad input");
}`;
  const result = extractThrows(code, 1, 3);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("ValidationError");
});

test("extractThrows finds plain throw expression", () => {
  const code = `function foo() {
  throw "something went wrong";
}`;
  const result = extractThrows(code, 1, 3);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("something went wrong");
});

test("extractThrows returns empty array when no throws", () => {
  const code = `function foo() { return 1; }`;
  const result = extractThrows(code, 1, 1);
  expect(result).toHaveLength(0);
});

test("extractThrows finds multiple throws", () => {
  const code = `function foo(x: string) {
  if (!x) throw new Error("missing x");
  if (x === "") throw new Error("empty x");
  return x;
}`;
  const result = extractThrows(code, 1, 5);
  expect(result).toHaveLength(2);
  expect(result[0]).toContain("missing x");
  expect(result[1]).toContain("empty x");
});
