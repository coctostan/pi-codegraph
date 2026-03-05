import { expect, test } from "bun:test";

test("tool modules export placeholder functions", async () => {
  const { symbolGraph } = await import("../src/tools/symbol-graph.js");
  const { resolveEdge } = await import("../src/tools/resolve-edge.js");

  expect(typeof symbolGraph).toBe("function");
  expect(typeof resolveEdge).toBe("function");
});
