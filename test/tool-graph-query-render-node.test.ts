import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows renders anchored node aliases", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-render-node-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function alpha() {}\n");

  try {
    const columns: CompiledColumn[] = [{ key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" }];
    const output = renderGraphQueryRows(
      [{
        a__id: "src/a.ts::alpha:1",
        a__kind: "function",
        a__name: "alpha",
        a__file: "src/a.ts",
        a__start_line: 1,
        a__end_line: 1,
        a__content_hash: "7ebd94f58d9952f6b7f251fefe95c24daaf58e7123a6e5196d0f86d3b7234ce4",
      }],
      columns,
      projectRoot,
    );

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/a.ts:1:");
    expect(output).toContain("alpha");
    expect(output).toContain("function");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
