import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows appends a stale marker for stale node anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-render-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function alpha() {}\n");

  try {
    const columns: CompiledColumn[] = [
      { key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" },
    ];

    const output = renderGraphQueryRows(
      [
        {
          a__id: "src/a.ts::alpha:1",
          a__kind: "function",
          a__name: "alpha",
          a__file: "src/a.ts",
          a__start_line: 1,
          a__end_line: 1,
          a__content_hash: "stale-hash",
        },
      ],
      columns,
      projectRoot,
    );

    expect(output).toContain("[stale]");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
