import { expect, test } from "bun:test";
test("pi extension no longer registers symbol_contract and keeps renderSymbolContractBody exported", async () => {
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const { default: piCodegraph } = await import("../src/index.js");
  const symbolContractMod = await import("../src/tools/symbol-contract.js");
  piCodegraph(mockPi as any);
  expect(registeredTools.find((t) => t.name === "symbol_contract")).toBeUndefined();
  expect(typeof (symbolContractMod as any).renderSymbolContractBody).toBe("function");
});