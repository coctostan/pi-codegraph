import { expect, test } from "bun:test";

test("pi extension registers graph_overview tool with no required parameters", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const tool = registeredTools.find((t) => t.name === "graph_overview");
  expect(tool).toBeDefined();

  const schema = tool!.parameters as any;
  // No required params
  expect(schema.required ?? []).toEqual([]);

  // Should have ptc with read-only policy
  expect((tool as any).ptc?.readOnly).toBe(true);
});
