import { expect, test } from "bun:test";

test("pi extension registers trace tool with an agent-oriented description", async () => {
  const registeredTools: Array<{
    name: string;
    description: string;
    parameters: unknown;
    execute: Function;
  }> = [];

  const mockPi = {
    registerTool(tool: {
      name: string;
      description: string;
      parameters: unknown;
      execute: Function;
    }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((tool) => tool.name === "trace");
  expect(traceTool).toBeDefined();
  expect(traceTool!.description).toBe(
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
});
