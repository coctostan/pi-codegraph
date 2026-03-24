import { expect, test } from "bun:test";

test("pi extension registers symbol_contract tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const scTool = registeredTools.find((t) => t.name === "symbol_contract");
  expect(scTool).toBeDefined();

  const schema = scTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
