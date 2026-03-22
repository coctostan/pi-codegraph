import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits parameterized LIKE SQL for STARTS WITH predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name STARTS WITH "get" RETURN n.name LIMIT 4',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("n0.name LIKE ?");
  expect(compiled.sql).not.toContain("get");
  expect(compiled.params).toEqual(["get%", 4]);
});
