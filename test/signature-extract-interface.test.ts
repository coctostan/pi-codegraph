import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile preserves interface header and members in signature", () => {
  const code = [
    "export interface Combined extends Foo, Bar {",
    "  find(name: string, file?: string): GraphNode[];",
    "  files: { total: number; stale: number };",
    "}",
  ].join("\n");

  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find((n) => n.name === "Combined");

  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe([
    "interface Combined extends Foo, Bar",
    "find(name: string, file?: string): GraphNode[]",
    "files: { total: number; stale: number }",
  ].join("\n"));
});
