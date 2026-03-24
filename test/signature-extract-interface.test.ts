import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for interface with extends", () => {
  const code = "interface MyInterface extends Base {}";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "MyInterface");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface MyInterface extends Base");
});

test("extractFile produces signature for interface with multiple extends", () => {
  const code = "interface Combined extends Foo, Bar {}";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "Combined");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface Combined extends Foo, Bar");
});

test("extractFile produces signature for interface without extends", () => {
  const code = "interface Plain { x: number; }";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "Plain");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface Plain");
});

test("extractFile produces signature for exported interface", () => {
  const code = "export interface Exported extends Base {}";
  const result = extractFile("src/a.ts", code);
  const ifaceNode = result.nodes.find(n => n.name === "Exported");
  expect(ifaceNode).toBeDefined();
  expect(ifaceNode!.signature).toBe("interface Exported extends Base");
});
