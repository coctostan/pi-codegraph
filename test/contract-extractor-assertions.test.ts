import { expect, test } from "bun:test";
import { extractTestAssertions, type TestBehavior } from "../src/indexer/contract-extractor.js";

test("extractTestAssertions extracts expect().toBe()", () => {
  const code = `test("returns hello", () => {
  const result = greet("world");
  expect(result).toBe("hello world");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("returns hello");
  expect(result[0]!.assertions).toHaveLength(1);
  expect(result[0]!.assertions[0]).toContain("toBe");
});

test("extractTestAssertions extracts expect().toThrow()", () => {
  const code = `test("throws on bad input", () => {
  expect(() => parse("")).toThrow("invalid");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("throws on bad input");
  expect(result[0]!.assertions[0]).toContain("toThrow");
});

test("extractTestAssertions extracts expect().toContain()", () => {
  const code = `test("includes item", () => {
  expect(list()).toContain("foo");
});`;
  const result = extractTestAssertions(code);
  expect(result[0]!.assertions[0]).toContain("toContain");
});

test("extractTestAssertions extracts expect().toHaveLength()", () => {
  const code = `test("has three items", () => {
  expect(items()).toHaveLength(3);
});`;
  const result = extractTestAssertions(code);
  expect(result[0]!.assertions[0]).toContain("toHaveLength");
});

test("extractTestAssertions groups by test name", () => {
  const code = `test("first test", () => {
  expect(a).toBe(1);
  expect(b).toBe(2);
});
test("second test", () => {
  expect(c).toContain("x");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(2);
  expect(result[0]!.testName).toBe("first test");
  expect(result[0]!.assertions).toHaveLength(2);
  expect(result[1]!.testName).toBe("second test");
  expect(result[1]!.assertions).toHaveLength(1);
});

test("extractTestAssertions returns empty for no assertions", () => {
  const code = `test("does something", () => {
  doStuff();
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.assertions).toHaveLength(0);
});

test("extractTestAssertions handles it() blocks", () => {
  const code = `it("should work", () => {
  expect(foo()).toBe(true);
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("should work");
});
