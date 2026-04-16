import { test } from "bun:test";

test("pi extension registers graph_query with the approved description", async () => {
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  mod.default(mockPi as any);
  const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
  if (!tool) {
    throw new Error("graph_query tool was not registered");
  }

  const expected = "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.";
  if (tool.description !== expected) {
    throw new Error(`graph_query description mismatch: ${tool.description}`);
  }
  if (tool.description.includes('MATCH (a {name: "hello"}) RETURN a')) {
    throw new Error("graph_query description still includes inline examples");
  }
});
