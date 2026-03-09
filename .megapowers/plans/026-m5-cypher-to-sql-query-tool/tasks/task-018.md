---
id: 18
title: Execute traversal queries that return an edge alias
status: approved
depends_on:
  - 8
  - 15
no_test: false
files_to_modify:
  - src/tools/graph-query-render.ts
files_to_create:
  - test/tool-graph-query-traversal-edge-alias.test.ts
---

### Task 18: Execute traversal queries that return an edge alias [depends: 8, 15]

**Covers AC:** 20, 21, 42, 44, 45

**Files:**
- Modify: `src/tools/graph-query-render.ts`
- Test: `test/tool-graph-query-traversal-edge-alias.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery renders returned traversal edge aliases with provenance details", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-traversal-edge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() { bar(); }\n";
  const bContent = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(aContent),
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(bContent),
    });
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: "ref",
        content_hash: sha256Hex(aContent),
      },
      created_at: 1,
    });

    const output = graphQuery({
      query: 'MATCH (a {name: "foo"})-[r:calls]->(b {name: "bar"}) RETURN a, r LIMIT 1',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("r: calls");
    expect(output).toContain("provenance:lsp");
    expect(output).toContain("confidence:0.9");
    expect(output).toContain("evidence:ref");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-traversal-edge-alias.test.ts`
Expected: FAIL — `expected output to contain "evidence:ref"` because edge rendering currently omits the `evidence:` field

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
          `  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  source:${String(row[`${column.sqlAliasPrefix}__source`])}  target:${String(row[`${column.sqlAliasPrefix}__target`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}  evidence:${String(row[`${column.sqlAliasPrefix}__evidence`])}`,
        );
      }
    }
  });

  return `${lines.join("\n")}\n`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-traversal-edge-alias.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
