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

test("pi extension registers resolve_edge tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const reTool = registeredTools.find((t) => t.name === "resolve_edge");
  expect(reTool).toBeDefined();

  const schema = reTool!.parameters as any;
  expect(schema.properties.source).toBeDefined();
  expect(schema.properties.target).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.properties.evidence).toBeDefined();
  expect(schema.required).toContain("source");
  expect(schema.required).toContain("target");
  expect(schema.required).toContain("kind");
  expect(schema.required).toContain("evidence");
  expect(schema.properties.sourceFile).toBeDefined();
  expect(schema.properties.targetFile).toBeDefined();
  expect(schema.required).not.toContain("sourceFile");
  expect(schema.required).not.toContain("targetFile");
});
