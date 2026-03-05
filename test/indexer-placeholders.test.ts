import { expect, test } from "bun:test";

test("indexer modules export placeholder functions", async () => {
  const { IndexPipeline } = await import("../src/indexer/pipeline.js");
  const { treeSitterIndex } = await import("../src/indexer/tree-sitter.js");

  expect(typeof IndexPipeline).toBe("function");
  expect(typeof treeSitterIndex).toBe("function");
});
