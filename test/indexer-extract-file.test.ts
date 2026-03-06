import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

test("extractFile returns module node with stable id and SHA-256 content hash", () => {
  const file = "src/a.ts";
  // Use a plain constant (no function/class/interface) so nodes stays empty.
  const content = "const x = 1;";

  const result = extractFile(file, content);

  const expectedHash = createHash("sha256").update(content).digest("hex");
  expect(result.module).toEqual({
    id: nodeId(file, file, 1),
    kind: "module",
    name: file,
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });
  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});

test("extractFile extracts non-exported function declarations (criterion 1)", () => {
  const file = "src/a.ts";
  const content = "function foo() {}";
  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  expect(result.nodes).toHaveLength(1);
  expect(result.nodes[0]).toEqual({
    id: nodeId(file, "foo", 1),
    kind: "function",
    name: "foo",
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });
});

test("extractFile extracts function declarations and arrow function assignments", () => {
  const file = "src/a.ts";
  const content = [
    "export function foo() {",
    "  return 1;",
    "}",
    "",
    "const bar = () => {};",
    "const baz = async () => {",
    "  return 2;",
    "};",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("foo")).toEqual({
    id: nodeId(file, "foo", 1),
    kind: "function",
    name: "foo",
    file,
    start_line: 1,
    end_line: 3,
    content_hash: expectedHash,
  });

  expect(byName.get("bar")).toEqual({
    id: nodeId(file, "bar", 5),
    kind: "function",
    name: "bar",
    file,
    start_line: 5,
    end_line: 5,
    content_hash: expectedHash,
  });

  expect(byName.get("baz")).toEqual({
    id: nodeId(file, "baz", 6),
    kind: "function",
    name: "baz",
    file,
    start_line: 6,
    end_line: 8,
    content_hash: expectedHash,
  });
});

test("extractFile extracts class and interface declarations", () => {
  const file = "src/types.ts";
  const content = ["class MyClass {}", "", "interface MyInterface {}"].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const byName = new Map(result.nodes.map((n) => [n.name, n]));

  expect(byName.get("MyClass")).toEqual({
    id: nodeId(file, "MyClass", 1),
    kind: "class",
    name: "MyClass",
    file,
    start_line: 1,
    end_line: 1,
    content_hash: expectedHash,
  });

  expect(byName.get("MyInterface")).toEqual({
    id: nodeId(file, "MyInterface", 3),
    kind: "interface",
    name: "MyInterface",
    file,
    start_line: 3,
    end_line: 3,
    content_hash: expectedHash,
  });
});

test("extractFile extracts import edges for named, aliased, and default imports", () => {
  const file = "src/imports.ts";
  const content = [
    "import { foo } from './bar';",
    'import { foo as baz } from "./bar";',
    'import Foo from "./bar";',
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const imports = result.edges.filter((e) => e.kind === "imports");

  const fooEdge = imports.find((e) => e.target.includes("::foo:"));
  expect(fooEdge).toBeDefined();
  expect(fooEdge).toMatchObject({
    source: nodeId(file, file, 1),
    kind: "imports",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: expect.stringContaining("./bar"),
      content_hash: expectedHash,
    },
  });

  const bazEdge = imports.find((e) => e.target.includes("::baz:"));
  expect(bazEdge).toBeUndefined();

  const defaultEdge = imports.find((e) => e.target.includes("::default:"));
  expect(defaultEdge).toBeDefined();
});

test("extractFile extracts calls edges for bare calls + constructors, ignoring method calls", () => {
  const file = "src/calls.ts";
  const content = [
    "function a() {",
    "  foo();",
    "  obj.method();",
    "  this.method();",
    "  new MyClass();",
    "}",
  ].join("\n");

  const result = extractFile(file, content);
  const expectedHash = createHash("sha256").update(content).digest("hex");

  const calls = result.edges.filter((e) => e.kind === "calls");

  const fooCall = calls.find((e) => e.target.includes("::foo:"));
  expect(fooCall).toBeDefined();
  expect(fooCall).toMatchObject({
    source: nodeId(file, "a", 1),
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      content_hash: expectedHash,
    },
  });

  const ctorCall = calls.find((e) => e.target.includes("::MyClass:"));
  expect(ctorCall).toBeDefined();

  expect(calls.some((e) => e.target.includes("::method:"))).toBe(false);
});

test("extractFile returns empty nodes/edges (but no throw) when the parse has errors", () => {
  const file = "src/bad.ts";

  // Missing closing brace => tree.rootNode.hasError() should be true.
  const content = ["function foo() {", "  return 1;"].join("\n");

  const result = extractFile(file, content);

  // Module node still exists, but symbol extraction is suppressed.
  expect(result.module.kind).toBe("module");
  expect(result.nodes).toEqual([]);
  expect(result.edges).toEqual([]);
});

// ---------- Task 2 additions ----------

test("extractFile records call-site coordinates in calls evidence (bare call)", () => {
  const file = "src/a.ts";
  // line 1: function caller() {
  // line 2:   return foo();     <— 'foo' at col 10 (2 spaces + "return " = 9 chars, then 'f')
  // line 3: }
  const content = "function caller() {\n  return foo();\n}";
  const result = extractFile(file, content);

  const callEdges = result.edges.filter(
    (e) => e.kind === "calls" && !e.target.includes("__unresolved__")
      || (e.kind === "calls" && e.target.includes("__unresolved__")),
  );
  // There should be at least one calls edge for the 'foo' call
  const fooEdge = result.edges.find(
    (e) => e.kind === "calls" && e.provenance.evidence.startsWith("foo:"),
  );
  expect(callEdges.length).toBeGreaterThan(0);
  expect(fooEdge).toBeDefined();
  // Evidence must be "name:line:col" using 1-based positions from the AST.
  // 'foo' is the callee identifier: startPosition.row=1 (+1=2), startPosition.column=9 (+1=10)
  expect(fooEdge!.provenance.evidence).toBe("foo:2:10");
});

test("extractFile records constructor call-site coordinates in calls evidence (new expression)", () => {
  const file = "src/b.ts";
  // line 1: function make() {
  // line 2:   return new Bar();   <— 'Bar' at col 14 (2 spaces + "return new " = 13 chars, then 'B')
  // line 3: }
  const content = "function make() {\n  return new Bar();\n}";
  const result = extractFile(file, content);

  const barEdge = result.edges.find(
    (e) => e.kind === "calls" && e.provenance.evidence.startsWith("Bar:"),
  );
  expect(barEdge).toBeDefined();
  // 'Bar' constructor: startPosition.row=1 (+1=2), startPosition.column=13 (+1=14)
  expect(barEdge!.provenance.evidence).toBe("Bar:2:14");
});