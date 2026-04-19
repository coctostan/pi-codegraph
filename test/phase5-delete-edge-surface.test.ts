import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits delete_edge when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("delete_edge")) return;
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

  if (registeredTools.some((tool) => tool.name === "delete_edge")) {
    throw new Error("delete_edge is still registered after the Phase 5 cut");
  }
});
