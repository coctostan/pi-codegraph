import { expect, test } from "bun:test";

test("all read-only tools are registered in pi extension", async () => {
  const tools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) { tools.push(tool); },
    on() {},
  };
  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const expected = [
    "symbol_graph", "symbol_card", "symbol_contract",
    "trace", "impact", "graph_query",
    "graph_overview", "dead_code",
    "resolve_edge", "delete_edge",
  ];
  for (const name of expected) {
    expect(tools.find((t) => t.name === name)).toBeDefined();
  }
});
