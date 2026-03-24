import { expect, test } from "bun:test";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile produces signature for class with constructor and heritage", () => {
  const code = "class MyService extends Base implements IService { constructor(private db: Database, name: string) {} doWork() {} }";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "MyService");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class MyService extends Base implements IService { constructor(db: Database, name: string) }");
});

test("extractFile produces signature for class without constructor", () => {
  const code = "class Empty extends Base {}";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Empty");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Empty extends Base");
});

test("extractFile produces signature for class with no heritage and no constructor", () => {
  const code = "class Plain {}";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Plain");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Plain");
});

test("extractFile produces signature for class with implements only", () => {
  const code = "class Impl implements IFoo, IBar { constructor(x: number) {} }";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Impl");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Impl implements IFoo, IBar { constructor(x: number) }");
});

test("extractFile produces signature for class with extends only", () => {
  const code = "class Child extends Parent { constructor() {} }";
  const result = extractFile("src/a.ts", code);
  const classNode = result.nodes.find(n => n.name === "Child");
  expect(classNode).toBeDefined();
  expect(classNode!.signature).toBe("class Child extends Parent { constructor() }");
});
