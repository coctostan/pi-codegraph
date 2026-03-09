import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits deterministic SQL joins and bound parameters", () => {
  const ast = parseGraphQuery(
    'MATCH (a {kind: "function", name: "foo"})-[r:calls]->(b {kind: "function"}) WHERE b.name = "bar" RETURN a, r, b.file LIMIT 3',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("FROM nodes n0");
  expect(compiled.sql).toContain("JOIN edges e0 ON e0.source = n0.id");
  expect(compiled.sql).toContain("JOIN nodes n1 ON n1.id = e0.target");
  expect(compiled.sql).toContain("n0.kind = ?");
  expect(compiled.sql).toContain("n0.name = ?");
  expect(compiled.sql).toContain("e0.kind = ?");
  expect(compiled.sql).toContain("n1.kind = ?");
  expect(compiled.sql).toContain("n1.name = ?");
  expect(compiled.sql).toContain("LIMIT ?");
  expect(compiled.sql).not.toContain("foo");
  expect(compiled.sql).not.toContain("bar");
  expect(compiled.params).toEqual([
    "function",
    "foo",
    "calls",
    "function",
    "bar",
    3,
  ]);
  expect(compiled.columns.map((c) => c.key)).toEqual([
    "a",
    "r",
    "b.file",
  ]);
});
