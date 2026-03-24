import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for typed function declaration", () => {
  const result = extractFile("src/a.ts", "function foo(x: string, y: number): boolean { return true; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x: string, y: number) => boolean");
});

test("extractFile produces signature for function with no return type", () => {
  const result = extractFile("src/a.ts", "function foo(x: string) { return x; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x: string)");
});

test("extractFile produces signature for function with no type annotations", () => {
  const result = extractFile("src/a.ts", "function foo(x, y) { return x; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x, y)");
});

test("extractFile produces signature for function with no params", () => {
  const result = extractFile("src/a.ts", "function foo(): void {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("() => void");
});

test("extractFile produces signature for exported function", () => {
  const result = extractFile("src/a.ts", "export function greet(name: string): string { return name; }");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(name: string) => string");
});

test("extractFile produces signature for function with optional param", () => {
  const result = extractFile("src/a.ts", "function foo(x: string, y?: number): void {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x: string, y?: number) => void");
});
