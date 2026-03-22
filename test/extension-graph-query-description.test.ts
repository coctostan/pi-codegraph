import { expect, test } from "bun:test";

test("pi extension documents working graph_query examples in the tool description", async () => {
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
  expect(tool).toBeDefined();
  expect(tool!.description).toContain('MATCH (a {name: "hello"}) RETURN a');
  expect(tool!.description).toContain('MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5');
  expect(tool!.description).toContain('MATCH (n) WHERE n.name = "GraphStore" RETURN n.name');
  expect(tool!.description).toContain('MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name');
  expect(tool!.description).toContain('MATCH (n {kind: "function"}) RETURN n LIMIT 10');
});
