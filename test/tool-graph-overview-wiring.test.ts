import { expect, test } from "bun:test";
test("pi extension registers graph_overview with no required parameters when CODEGRAPH_DEVMODE=1", async () => {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };
  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);
    const tool = registeredTools.find((candidate) => candidate.name === "graph_overview");
    expect(tool).toBeDefined();
    expect((tool!.parameters as any).required ?? []).toEqual([]);
    expect((tool as any).ptc?.readOnly).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});