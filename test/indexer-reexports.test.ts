import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts re-export with original name", () => {
  const file = "src/index.ts";
  const content = 'export { foo } from "./bar";';
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  const fooEdge = importEdges.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();
  expect(fooEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: expect.stringContaining("./bar"),
      content_hash: expectedHash,
    },
  });
});

test("extractFile extracts re-export with alias using original name", () => {
  const file = "src/index.ts";
  const content = 'export { foo as baz } from "./bar";';
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports");

  // Edge should target original name "foo", not alias "baz"
  const fooEdge = importEdges.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();

  const bazEdge = importEdges.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined();
});

test("extractFile extracts multiple re-exports from barrel file", () => {
  const file = "src/index.ts";
  const content = [
    'export { alpha, beta } from "./math";',
    'export { gamma } from "./science";',
  ].join("\n");
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  expect(importEdges.find((e) => e.target.includes("::alpha:"))).toBeDefined();
  expect(importEdges.find((e) => e.target.includes("::beta:"))).toBeDefined();
  expect(importEdges.find((e) => e.target.includes("::gamma:"))).toBeDefined();
  expect(importEdges).toHaveLength(3);
});
