import { expect, test } from "bun:test";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows returns structured empty output for zero rows", () => {
  const columns: CompiledColumn[] = [
    { key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" },
  ];

  expect(renderGraphQueryRows([], columns, "/tmp/project")).toBe("rows: 0\n");
});
