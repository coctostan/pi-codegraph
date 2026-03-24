import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("module node has no signature (undefined, not empty string)", () => {
  const result = extractFile("src/a.ts", "const x = 1;");
  expect(result.module.signature).toBeUndefined();
  expect("signature" in result.module).toBe(false);
});

test("function node without any type annotations still gets a param-only signature", () => {
  const result = extractFile("src/a.ts", "function foo() {}");
  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]!.signature).toBe("()");
});
