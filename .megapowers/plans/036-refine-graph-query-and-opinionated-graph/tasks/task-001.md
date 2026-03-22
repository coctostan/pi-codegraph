---
id: 1
title: Add deterministic suggestions for unsupported graph_query forms
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
  - src/tools/graph-query.ts
files_to_create:
  - test/tool-graph-query-unsupported-suggestion.test.ts
---

### Task 1: Add deterministic suggestions for unsupported graph_query forms

**Files:**
- Create: `test/tool-graph-query-unsupported-suggestion.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-unsupported-suggestion.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-graph-query-unsupported-suggestion.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery returns a deterministic suggestion for unsupported ORDER BY queries", () => {
  const fakeStore = {
    getStatistics() {
      return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "foo"}) RETURN a ORDER BY a.name',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain("unsupported_error: ORDER BY is not supported");
  expect(output).toContain('try instead: MATCH (a {name: "foo"}) RETURN a LIMIT 10');
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-unsupported-suggestion.test.ts`
Expected: FAIL — `expect(received).toContain("try instead: MATCH (a {name: \"foo\"}) RETURN a LIMIT 10")`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, replace the `GraphQueryError` class with:
```ts
export class GraphQueryError extends Error {
  constructor(
    public kind: GraphQueryErrorKind,
    message: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = "GraphQueryError";
  }
}

export function formatGraphQueryError(error: GraphQueryError): string {
  let text = `${error.kind}: ${error.message}\n`;
  if (error.suggestion) text += `try instead: ${error.suggestion}\n`;
  return text;
}
```

In `src/tools/graph-query-parser.ts`, replace `rejectUnsupported()` with:
```ts
function rejectUnsupported(query: string): void {
  if (/\bOPTIONAL\s+MATCH\b/i.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "OPTIONAL MATCH is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  if (/\bCOUNT\s*\(/i.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "aggregation is not supported",
      'MATCH (a {kind: "function"}) RETURN a LIMIT 10',
    );
  }
  if (/\bORDER\s+BY\b/i.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "ORDER BY is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  const queryWithoutStrings = query.replace(/"[^"]*"/g, '""');
  if (/\bCREATE\b|\bMERGE\b|\bDELETE\b|\bSET\b/i.test(queryWithoutStrings)) {
    throw new GraphQueryError(
      "unsupported_error",
      "mutating queries are not supported",
      'MATCH (a {name: "foo"}) RETURN a',
    );
  }
  if (/\[\s*\*[^\]]*\]/.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "variable-length paths are not supported",
      'MATCH (a)-[:calls]->(b) RETURN a, b LIMIT 10',
    );
  }
}
```

In `src/tools/graph-query.ts`, change the parser import and error rendering to:
```ts
import { formatGraphQueryError, GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
```

```ts
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return prependTrustHeader(formatGraphQueryError(error), { stats });
    }
    throw error;
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-unsupported-suggestion.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
