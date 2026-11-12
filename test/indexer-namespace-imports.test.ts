import { expect, test } from "bun:test";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts namespace import and resolves qualified calls", () => {
  const file = "src/app.ts";
  const content = [
    'import * as utils from "./utils";',
    "function main() {",
    "  utils.helper();",
    "  utils.format();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  // Should have an import edge for the namespace
  const importEdges = result.edges.filter((e) => e.kind === "imports");
  const nsImport = importEdges.find((e) => e.target.includes("::*:"));
  expect(nsImport).toBeDefined();
  expect(nsImport!.provenance.evidence).toContain("./utils");

  // utils.helper() should create a calls edge to __unresolved__::helper:0
  const callEdges = result.edges.filter((e) => e.kind === "calls");
  const helperCall = callEdges.find((e) => e.target.includes("::helper:"));
  expect(helperCall).toBeDefined();
  expect(helperCall!.source).toBe(nodeId(file, "main", 2));

  // utils.format() should create a calls edge to __unresolved__::format:0
  const formatCall = callEdges.find((e) => e.target.includes("::format:"));
  expect(formatCall).toBeDefined();
});

test("extractFile files a non-namespace member call as a hidden member call, not a qualified one", () => {
  const file = "src/plain.ts";
  const content = [
    "function run() {",
    "  obj.method();",
    "  this.foo();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);

  const callEdges = result.edges.filter((e) => e.kind === "calls");
  // obj is no namespace import, so its call waits on the LSP stage; this outside a class is no class's
  expect(callEdges.filter((e) => e.target.includes("::method:")).map((e) => e.target)).toEqual([
    nodeId("__member__", "method", 0),
  ]);
  expect(callEdges.find((e) => e.target.includes("::foo:"))).toBeUndefined();
});
