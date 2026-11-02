import { expect, test } from "bun:test";

import { nodeId } from "../src/graph/types.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

const file = "tests/a.test.ts";

function callsFrom(source: string, content: string): string[] {
  return extractFile(file, content)
    .edges.filter((e) => e.kind === "calls" && e.source === source)
    .map((e) => e.target);
}

test("a literal-titled test( or it( callback becomes a test node spanning the callback", () => {
  const content = [
    'import { it, test } from "bun:test";',
    'test("adds one", () => {',
    "  add(1);",
    "});",
    "it(`drops the rest`, function () {",
    "  drop();",
    "});",
    'test(/* regression */ "keeps a comment", () => keep());',
  ].join("\n");

  const tests = extractFile(file, content).nodes.filter((n) => n.kind === "test");

  expect(tests.map((n) => [n.name, n.start_line, n.end_line])).toEqual([
    [`${file} > adds one`, 2, 4],
    [`${file} > drops the rest`, 5, 7],
    [`${file} > keeps a comment`, 8, 8],
  ]);
});

test("a call inside the callback is attributed to its test node, the test( call itself to nothing", () => {
  const content = ['test("adds one", () => {', "  add(1);", "  expect(add(2)).toBe(3);", "});"].join("\n");
  const testId = nodeId(file, `${file} > adds one`, 1);

  expect(callsFrom(testId, content).sort()).toEqual(["__unresolved__::add:0", "__unresolved__::expect:0"]);
  expect(extractFile(file, content).edges.filter((e) => e.kind === "calls" && e.source !== testId)).toEqual([]);
});

test("a non-literal title makes no test node and attributes its calls to the module", () => {
  const content = ["const name = 'x';", "test(`adds ${name}`, () => {", "  add(1);", "});", "it(name, () => drop());"].join("\n");
  const result = extractFile(file, content);

  expect(result.nodes.filter((n) => n.kind === "test")).toEqual([]);
  expect(callsFrom(result.module.id, content).sort()).toEqual(["__unresolved__::add:0", "__unresolved__::drop:0"]);
});

test("describe bodies, other callees and a titled call without a callback make no test node", () => {
  const content = [
    'describe("suite", () => {',
    "  setup();",
    '  test.skip("skipped", () => skip());',
    '  it("nested", () => inner());',
    "});",
    'test("todo");',
  ].join("\n");
  const result = extractFile(file, content);

  expect(result.nodes.filter((n) => n.kind === "test").map((n) => n.name)).toEqual([`${file} > nested`]);
  expect(callsFrom(nodeId(file, `${file} > nested`, 4), content)).toEqual(["__unresolved__::inner:0"]);
  expect(result.edges.filter((e) => e.kind === "calls").map((e) => e.target)).toEqual(["__unresolved__::inner:0"]);
});
