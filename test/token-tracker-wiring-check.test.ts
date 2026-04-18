import { expect, test } from "bun:test";

test("the default public tools are registered in the pi extension", async () => {
  const tools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      tools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const expected = [
    "symbol_graph",
    "trace",
    "impact",
    "resolve_edge",
    "delete_edge",
  ];

  for (const name of expected) {
    expect(tools.find((tool) => tool.name === name)).toBeDefined();
  }
});
