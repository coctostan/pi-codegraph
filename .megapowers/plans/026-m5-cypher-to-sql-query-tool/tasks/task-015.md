---
id: 15
title: Render structural edge rows for graph query results
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/tools/graph-query-render.ts
files_to_create:
  - test/tool-graph-query-render-edge.test.ts
---

### Task 15: Render structural edge rows for graph query results [depends: 5]

**Covers AC:** 38

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-edge.test.ts`

**Step 1 — Write the failing test**
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-edge.test.ts`
Expected: FAIL — `expected "rows: 1\nrow 1\n" to contain "r: calls"`

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
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}`);
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
Run: `bun test test/tool-graph-query-render-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
