---
id: 6
title: Prepend trust header to graph_query
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/graph-query.ts
  - src/tools/graph-query-render.ts
  - test/tool-graph-query-empty-query.test.ts
  - test/tool-graph-query-execution-error.test.ts
files_to_create:
  - test/tool-graph-query-trust-header.test.ts
---

### Task 6: Prepend trust header to graph_query [depends: 1]

**Files:**
- Modify: `src/tools/graph-query.ts`
- Modify: `src/tools/graph-query-render.ts`
- Modify: `test/tool-graph-query-empty-query.test.ts` (update assertion for trust header)
- Modify: `test/tool-graph-query-execution-error.test.ts` (add `getStatistics` to fakeStore, update assertion)
- Test: `test/tool-graph-query-trust-header.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery prepends the shared trust header and keeps stale node markers local", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-trust-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const content = "export function hello() { return 'world'; }\n";
  writeFileSync(join(projectRoot, "src", "hello.ts"), content);

  const freshHash = sha256Hex(content);
  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: freshHash,
      is_exported: true,
    });

    const freshOutput = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });
    const freshLines = freshOutput.trimEnd().split("\n");

    expect(freshLines[0]).toBe("## Trust");
    expect(freshLines[1]).toBe("status: fresh");
    expect(freshLines[2]).toBe("evidence: none  stale-files: 0/0");
    expect(freshLines[3]).toBe("rows: 1");
    expect(freshOutput).not.toContain("[stale]");

    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "stale-hash",
      is_exported: true,
    });

    const mixedOutput = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });
    const mixedLines = mixedOutput.trimEnd().split("\n");

    expect(mixedLines[0]).toBe("## Trust");
    expect(mixedLines[1]).toBe("status: mixed");
    expect(mixedLines[2]).toBe("evidence: none  stale-files: 0/0");
    expect(mixedOutput).toContain("a: src/hello.ts:1:");
    expect(mixedOutput).toContain("function [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-trust-header.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` with `Expected: "## Trust"` and `Received: "rows: 1"`

**Step 3 — Write minimal implementation**
```ts
// src/tools/graph-query-render.ts
import { computeAnchor } from "../output/anchoring.js";
import type { GraphNode } from "../graph/types.js";
import type { CompiledColumn } from "./graph-query-compiler.js";

interface GraphNodeRow {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
}

export interface GraphQueryRenderResult {
  text: string;
  hasLocalExceptions: boolean;
}

function readNode(row: Record<string, unknown>, prefix: string): GraphNodeRow {
  return {
    id: String(row[`${prefix}__id`]),
    kind: row[`${prefix}__kind`] as GraphNode["kind"],
    name: String(row[`${prefix}__name`]),
    file: String(row[`${prefix}__file`]),
    start_line: Number(row[`${prefix}__start_line`]),
    end_line: row[`${prefix}__end_line`] == null ? null : Number(row[`${prefix}__end_line`]),
    content_hash: String(row[`${prefix}__content_hash`]),
  };
}

export function renderGraphQueryResult(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): GraphQueryRenderResult {
  if (rows.length === 0) {
    return { text: "rows: 0\n", hasLocalExceptions: false };
  }

  let hasLocalExceptions = false;
  const lines: string[] = [`rows: ${rows.length}`];

  rows.forEach((row, index) => {
    lines.push(`row ${index + 1}`);
    for (const column of columns) {
      if (column.kind === "node") {
        const node = readNode(row, column.sqlAliasPrefix);
        const anchor = computeAnchor(node, projectRoot);
        if (anchor.stale) hasLocalExceptions = true;
        lines.push(`  ${column.key}: ${anchor.anchor}  ${node.name}  ${node.kind}${anchor.stale ? " [stale]" : ""}`);
        continue;
      }
      if (column.kind === "edge") {
        lines.push(`  ${column.key}: ${String(row[`${column.sqlAliasPrefix}__kind`])}  source:${String(row[`${column.sqlAliasPrefix}__source`])}  target:${String(row[`${column.sqlAliasPrefix}__target`])}  provenance:${String(row[`${column.sqlAliasPrefix}__provenance_source`])}  confidence:${String(row[`${column.sqlAliasPrefix}__confidence`])}  evidence:${String(row[`${column.sqlAliasPrefix}__evidence`])}`);
        continue;
      }
      if (column.kind === "scalar") {
        lines.push(`  ${column.key}: ${String(row[column.sqlAlias])}`);
      }
    }
  });

  return { text: `${lines.join("\n")}\n`, hasLocalExceptions };
}

export function renderGraphQueryRows(
  rows: Array<Record<string, unknown>>,
  columns: CompiledColumn[],
  projectRoot: string,
): string {
  return renderGraphQueryResult(rows, columns, projectRoot).text;
}
```

```ts
// src/tools/graph-query.ts
import type { GraphStore } from "../graph/store.js";
import { prependTrustHeader } from "../output/trust.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryResult } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  const stats = params.store.getStatistics(params.projectRoot);

  try {
    if (params.query.trim().length === 0) {
      return prependTrustHeader("parse_error: query must not be empty\n", { stats });
    }

    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);

    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      const rendered = renderGraphQueryResult(rows, compiled.columns, params.projectRoot);
      return prependTrustHeader(rendered.text, {
        stats,
        hasLocalExceptions: rendered.hasLocalExceptions,
      });
    } catch {
      return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return prependTrustHeader(`${error.kind}: ${error.message}\n`, { stats });
    }
    throw error;
  }
}
```

**Also in Step 3 — Update existing test assertions that break due to trust header**

In `test/tool-graph-query-empty-query.test.ts`, replace the full test body:
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery rejects blank query strings with parse_error", () => {
  const store = new SqliteGraphStore();
  try {
    const output = graphQuery({
      query: "   \n\t  ",
      store,
      projectRoot: "/tmp/project",
    });

    expect(output).toContain("## Trust");
    expect(output).toContain("parse_error: query must not be empty");
  } finally {
    store.close();
  }
});
```

In `test/tool-graph-query-execution-error.test.ts`, replace the full test body (adds `getStatistics` to fakeStore and relaxes assertion):
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery converts store execution failures into execution_error output", () => {
  const fakeStore = {
    queryRows() {
      throw new Error("sqlite busy");
    },
    getStatistics() {
      return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "hello"}) RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain("## Trust");
  expect(output).toContain("execution_error: failed to execute compiled query");
});
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-trust-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
