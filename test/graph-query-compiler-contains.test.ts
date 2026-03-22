import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits parameterized LIKE SQL for CONTAINS predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name CONTAINS "Handler" RETURN n.name LIMIT 2',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("n0.name LIKE ?");
  expect(compiled.sql).not.toContain("Handler");
  expect(compiled.params).toEqual(["%Handler%", 2]);
});
