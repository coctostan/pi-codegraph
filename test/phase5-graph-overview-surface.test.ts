import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits graph_overview when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("graph_overview")) return;

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string }> = [];
    const mockPi = {
      registerTool(tool: { name: string }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);

    if (registeredTools.some((tool) => tool.name === "graph_overview")) {
      throw new Error("graph_overview is still registered after the Phase 5 cut");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
