import { expect, test } from "bun:test";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows renders structural edge aliases", () => {
  const columns: CompiledColumn[] = [
    { key: "r", kind: "edge", alias: "r", sqlAliasPrefix: "r" },
  ];

  const output = renderGraphQueryRows(
    [
      {
        r__source: "src/a.ts::alpha:1",
        r__target: "src/b.ts::beta:1",
        r__kind: "calls",
        r__provenance_source: "lsp",
        r__confidence: 0.9,
        r__evidence: "ref",
        r__content_hash: "h1",
        r__created_at: 1,
      },
    ],
    columns,
    "/tmp/project",
  );

  expect(output).toContain("r: calls");
  expect(output).toContain("provenance:lsp");
  expect(output).toContain("confidence:0.9");
});
