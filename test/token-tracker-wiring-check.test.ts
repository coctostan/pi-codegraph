import { expect, test } from "bun:test";
import { expectedDefaultPublicTools } from "./phase5-decision-matrix.js";
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
  for (const name of expectedDefaultPublicTools) {
    expect(tools.find((tool) => tool.name === name)).toBeDefined();
  }
});
