---
id: 24
title: Reject ORDER BY in graph queries
status: approved
depends_on:
  - 23
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-unsupported-order-by.test.ts
---

### Task 24: Reject ORDER BY in graph queries [depends: 23]

**Covers AC:** 31

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-order-by.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for ORDER BY", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN a ORDER BY a.name'))
    .toThrowError(/ORDER BY is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-order-by.test.ts`
Expected: FAIL — parser currently does not return `unsupported_error: ORDER BY is not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bORDER\s+BY\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "ORDER BY is not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-order-by.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
