---
id: 17
title: Render rows zero for empty graph query results
status: approved
depends_on:
  - 16
no_test: false
files_to_modify:
  - src/tools/graph-query-render.ts
files_to_create:
  - test/tool-graph-query-render-empty.test.ts
---

### Task 17: Render rows zero for empty graph query results [depends: 16]

**Covers AC:** 40

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-empty.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import type { CompiledColumn } from "../src/tools/graph-query-compiler.js";
import { renderGraphQueryRows } from "../src/tools/graph-query-render.js";

test("renderGraphQueryRows returns structured empty output for zero rows", () => {
  const columns: CompiledColumn[] = [
    { key: "a", kind: "node", alias: "a", sqlAliasPrefix: "a" },
  ];

  expect(renderGraphQueryRows([], columns, "/tmp/project")).toBe("rows: 0\n");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-empty.test.ts`
Expected: FAIL — `expected "rows: 0\n" but received "rows: 0\nrow 1..."` or another non-short-circuited value because `renderGraphQueryRows()` does not yet return early for empty rows

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  if (rows.length === 0) {
    return "rows: 0\n";
  }

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
Run: `bun test test/tool-graph-query-render-empty.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
