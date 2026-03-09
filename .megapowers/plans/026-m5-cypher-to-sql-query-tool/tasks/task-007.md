---
id: 7
title: Return execution_error when compiled SQL execution fails
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/graph-query.ts
files_to_create:
  - test/tool-graph-query-execution-error.test.ts
---

### Task 7: Return execution_error when compiled SQL execution fails [depends: 6]

**Covers AC:** 34

**Files:**
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-execution-error.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery converts store execution failures into execution_error output", () => {
  const fakeStore = {
    queryRows() {
      throw new Error("sqlite busy");
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "hello"}) RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toBe("execution_error: failed to execute compiled query\n");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-execution-error.test.ts`
Expected: FAIL — `Error: sqlite busy`

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
Run: `bun test test/tool-graph-query-execution-error.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
