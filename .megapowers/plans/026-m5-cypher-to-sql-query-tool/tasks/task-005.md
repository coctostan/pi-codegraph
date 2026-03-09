---
id: 5
title: Render anchored node rows for graph query results
status: approved
depends_on:
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/graph-query-render.ts
  - test/tool-graph-query-render-node.test.ts
---

### Task 5: Render anchored node rows for graph query results [depends: 4]

**Covers AC:** 37

**Files:**
- Create: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-render-node.test.ts`

**Step 1 — Write the failing test**
```ts
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
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-render-node.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query-render.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-render.ts`
```ts
import { computeAnchor } from "../output/anchoring.js";
import type { CompiledColumn } from "./graph-query-compiler.js";

interface GraphNodeRow {
  id: string;
  kind: string;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

function readNode(row: Record<string, unknown>, prefix: string): GraphNodeRow {
  return {
    id: String(row[`${prefix}__id`]),
    kind: String(row[`${prefix}__kind`]),
    name: String(row[`${prefix}__name`]),
    file: String(row[`${prefix}__file`]),
    start_line: Number(row[`${prefix}__start_line`]),
    end_line: row[`${prefix}__end_line`] == null ? null : Number(row[`${prefix}__end_line`]),
    content_hash: String(row[`${prefix}__content_hash`]),
  };
}

export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind !== "node") continue;
      const node = readNode(row, column.sqlAliasPrefix);
      const anchor = computeAnchor(node, projectRoot);
      lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}`);
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-render-node.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
