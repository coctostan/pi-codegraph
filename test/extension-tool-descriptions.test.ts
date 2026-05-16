import { test } from "bun:test";
import { expectedDefaultPublicToolDescriptions } from "./phase5-decision-matrix.js";
test("pi extension registers the approved descriptions for the default public tools", async () => {
  const expected = expectedDefaultPublicToolDescriptions;
  const expectedIncludeDescription = "Extra sections to include.";
  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
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
    if (!tool.description.trim()) throw new Error(`empty description for ${tool.name}`);
    const wanted = expected.get(tool.name);
    if (!wanted) throw new Error(`unexpected tool registered: ${tool.name}`);
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
  const symbolGraph = registeredTools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraph) throw new Error("symbol_graph was not registered");
  const includeDescription = symbolGraph.parameters?.properties?.include?.description;
  if (includeDescription !== expectedIncludeDescription) {
    throw new Error(`symbol_graph include description mismatch: ${includeDescription}`);
  }
});
