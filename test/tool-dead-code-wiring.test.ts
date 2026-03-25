import { expect, test } from "bun:test";

test("pi extension registers dead_code tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const tool = registeredTools.find((t) => t.name === "dead_code");
  expect(tool).toBeDefined();

  const schema = tool!.parameters as any;
  expect(schema.required ?? []).toEqual([]);
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.properties.glob).toBeDefined();

  expect((tool as any).ptc?.readOnly).toBe(true);
});
