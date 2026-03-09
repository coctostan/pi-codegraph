---
id: 9
title: Return parse_error for blank graphQuery input
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/graph-query.ts
files_to_create:
  - test/tool-graph-query-empty-query.test.ts
---

### Task 9: Return parse_error for blank graphQuery input [depends: 6]

**Covers AC:** 24

**Files:**
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-empty-query.test.ts`
**Step 1 — Write the failing test**
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

    expect(output).toBe("parse_error: query must not be empty\n");
  } finally {
    store.close();
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-empty-query.test.ts`
Expected: FAIL — `expected "parse_error: query must not be empty\n" but received "parse_error: expected MATCH ... RETURN ...\n"`
**Step 3 — Write minimal implementation**
`src/tools/graph-query.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryRows } from "./graph-query-render.js";
export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}
export function graphQuery(params: GraphQueryParams): string {
  try {
    if (params.query.trim().length === 0) {
      return "parse_error: query must not be empty\n";
    }
    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);
    try {
      const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
      return renderGraphQueryRows(rows, compiled.columns, params.projectRoot);
    } catch {
      return "execution_error: failed to execute compiled query\n";
    }
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return `${error.kind}: ${error.message}\n`;
    }
    throw error;
  }
}
```
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-empty-query.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
