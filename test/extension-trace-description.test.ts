import { test } from "bun:test";

test("pi extension registers trace with the approved description", async () => {
  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((tool) => tool.name === "trace");
  if (!traceTool) {
    throw new Error("trace tool was not registered");
  }

  const expected = "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.";
  if (traceTool.description !== expected) {
    throw new Error(`trace description mismatch: ${traceTool.description}`);
  }
});
