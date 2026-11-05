import { expect, test } from "bun:test";
test("pi extension registers symbol_graph tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const sgTool = registeredTools.find((t) => t.name === "symbol_graph");
  expect(sgTool).toBeDefined();

  const schema = sgTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});

test("pi extension registers trace tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((t) => t.name === "trace");
  expect(traceTool).toBeDefined();

  const schema = traceTool!.parameters as any;
  expect(schema.properties.entry).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.properties.line).toBeDefined();
  // `entry` is optional since `file` + `line` can start a trace instead.
  expect(schema.required ?? []).toEqual([]);
});