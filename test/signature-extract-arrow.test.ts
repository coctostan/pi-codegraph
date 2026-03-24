import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for typed arrow function", () => {
  const result = extractFile("src/a.ts", "const greet = (name: string): string => name;");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.name).toBe("greet");
  expect(result.nodes[0]!.signature).toBe("(name: string) => string");
});

test("extractFile produces signature for arrow function without return type", () => {
  const result = extractFile("src/a.ts", "const greet = (name: string) => name;");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(name: string)");
});

test("extractFile produces signature for arrow function with no types", () => {
  const result = extractFile("src/a.ts", "const fn = (x, y) => x + y;");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(x, y)");
});

test("extractFile produces signature for async arrow function", () => {
  const result = extractFile("src/a.ts", "const fetch = async (url: string): Promise<Response> => { return new Response(); };");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("(url: string) => Promise<Response>");
});
