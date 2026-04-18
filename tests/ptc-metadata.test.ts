import { describe, it, expect } from "bun:test";
import piCodegraph from "../src/index.js";

describe("PTC metadata on tool registrations", () => {
  const tools = new Map<string, any>();

  // Mock pi.registerTool to capture registration objects
  const mockPi = {
    registerTool(tool: any) {
      tools.set(tool.name, tool);
    },
  } as any;

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    piCodegraph(mockPi);
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }

  const READ_ONLY_TOOLS = [
    "symbol_graph",
    "impact",
    "trace",
    "graph_query",
    "graph_overview",
    "dead_code",
  ];

  const MUTATING_TOOLS = ["resolve_edge", "delete_edge"];

  for (const name of READ_ONLY_TOOLS) {
    it(`${name} has ptc metadata with correct shape`, () => {
      const tool = tools.get(name);
      expect(tool).toBeDefined();
      expect(tool.ptc).toEqual({
        callable: true,
        enabled: true,
        policy: "read-only",
        readOnly: true,
        pythonName: name,
      });
    });
  }

  for (const name of MUTATING_TOOLS) {
    it(`${name} does NOT have ptc metadata`, () => {
      const tool = tools.get(name);
      expect(tool).toBeDefined();
      expect(tool.ptc).toBeUndefined();
    });
  }
});
