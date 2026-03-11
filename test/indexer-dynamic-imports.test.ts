import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile extracts dynamic import as low-confidence import edge", () => {
  const file = "src/lazy.ts";
  const content = [
    "async function loadModule() {",
    '  const mod = await import("./heavy");',
    "}",
  ].join("\n");
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const importEdges = result.edges.filter((e) => e.kind === "imports");
  // Dynamic import creates a module-level import edge
  const dynamicEdge = importEdges.find((e) => e.provenance.confidence === 0.3);
  expect(dynamicEdge).toBeDefined();
  expect(dynamicEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.3,
      evidence: expect.stringContaining("./heavy"),
      content_hash: expectedHash,
    },
  });
});

test("extractFile ignores dynamic import with non-string-literal argument", () => {
  const file = "src/computed.ts";
  const content = [
    "async function loadDynamic(name: string) {",
    "  const mod = await import(name);",
    "}",
  ].join("\n");
  const result = extractFile(file, content);

  const importEdges = result.edges.filter((e) => e.kind === "imports" && e.provenance.confidence === 0.3);
  expect(importEdges).toHaveLength(0);
});
