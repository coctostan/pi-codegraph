import { expect, test } from "bun:test";
test("current tool modules export callable functions", async () => {
  const { symbolGraph } = await import("../src/tools/symbol-graph.js");
  const { impact } = await import("../src/tools/impact.js");
  const { trace } = await import("../src/tools/trace.js");
  expect(typeof symbolGraph).toBe("function");
  expect(typeof impact).toBe("function");
  expect(typeof trace).toBe("function");
});