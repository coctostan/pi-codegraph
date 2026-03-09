---
id: 16
title: Mark stale anchored nodes in rendered graph query results
status: approved
depends_on:
  - 15
no_test: false
files_to_modify:
  - src/tools/graph-query-render.ts
files_to_create:
  - test/tool-graph-query-render-stale.test.ts
---

### Task 16: Mark stale anchored nodes in rendered graph query results [depends: 15]

**Covers AC:** 39

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-stale.test.ts`

**Step 1 — Write the failing test**
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-stale.test.ts`
Expected: FAIL — `expected "rows: 1\nrow 1\n  a: src/a.ts:1:` to contain "[stale]"`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }

      if (column.kind === "edge") {
        lines.push(
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}`,
        );
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-render-stale.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
