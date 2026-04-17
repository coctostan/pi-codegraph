import { expect, test } from "bun:test";
test("pi extension no longer registers symbol_card and keeps internal renderers exported", async () => {
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const { default: piCodegraph } = await import("../src/index.js");
  const symbolCardMod = await import("../src/tools/symbol-card.js");
  piCodegraph(mockPi as any);
  expect(registeredTools.find((t) => t.name === "symbol_card")).toBeUndefined();
  expect(typeof (symbolCardMod as any).renderSymbolCardBody).toBe("function");
  expect(typeof (symbolCardMod as any).renderSymbolSourceSection).toBe("function");
});