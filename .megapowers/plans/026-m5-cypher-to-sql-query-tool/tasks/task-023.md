---
id: 23
title: Reject aggregation in graph queries
status: approved
depends_on:
  - 22
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-unsupported-aggregation.test.ts
---

### Task 23: Reject aggregation in graph queries [depends: 22]

**Covers AC:** 30

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-aggregation.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for aggregation", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN COUNT(a)'))
    .toThrowError(/aggregation is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-aggregation.test.ts`
Expected: FAIL — query currently reaches generic parse/validation path instead of `unsupported_error: aggregation is not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bCOUNT\s*\(/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "aggregation is not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-aggregation.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
