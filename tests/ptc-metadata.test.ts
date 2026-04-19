import { describe, it, expect } from "bun:test";
import piCodegraph from "../src/index.js";
import { isRemoved, type Phase5Tool } from "../test/phase5-decision-matrix.js";

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

  const READ_ONLY_TOOLS = ([
    "symbol_graph",
    "impact",
    "trace",
    "graph_query",
    "graph_overview",
    "dead_code",
  ] as const).filter((name) => {
    if (name === "graph_query" || name === "graph_overview" || name === "dead_code") {
      return !isRemoved(name as Phase5Tool);
    }
    return true;
  });

  const MUTATING_TOOLS = (["resolve_edge", "delete_edge"] as const).filter(
    (name) => !isRemoved(name as Phase5Tool),
  );

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
