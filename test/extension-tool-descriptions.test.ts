import { test } from "bun:test";

test("pi extension registers the approved descriptions for all 11 tools", async () => {
  const expected = new Map<string, string>([
    ["symbol_graph", "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol."],
    ["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."],
    ["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."],
    ["impact", "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code."],
    ["trace", "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs."],
    ["graph_query", "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query."],
    ["symbol_card", "Return a compact symbol summary with definition, signature, tests, relationships, and signals."],
    ["symbol_contract", "Return a symbol's behavioral contract from code and tests.\nWhen to use: You need inputs, outputs, throws, or asserted behavior."],
    ["graph_overview", "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points."],
    ["dead_code", "Find unreferenced exported symbols or check whether a symbol is still referenced.\nWhen to use: You are looking for cleanup candidates."],
    ["symbol_search", "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file."],
  ]);

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default(mockPi as any);

  const names = registeredTools.map((tool) => tool.name).sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`registered tool list mismatch: ${names.join(",")}`);
  }

  for (const tool of registeredTools) {
    if (!tool.description.trim()) {
      throw new Error(`empty description for ${tool.name}`);
    }
    const wanted = expected.get(tool.name);
    if (!wanted) {
      throw new Error(`unexpected tool registered: ${tool.name}`);
    }
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
});
