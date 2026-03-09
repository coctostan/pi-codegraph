---
id: 25
title: Reject mutating Cypher queries
status: approved
depends_on:
  - 24
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-unsupported-mutation.test.ts
---

### Task 25: Reject mutating Cypher queries [depends: 24]

**Covers AC:** 32

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-mutation.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for mutating queries", () => {
  expect(() => parseGraphQuery('CREATE (a {name: "foo"}) RETURN a'))
    .toThrowError(/mutating queries are not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-mutation.test.ts`
Expected: FAIL — parser currently returns parse_error for CREATE query instead of `unsupported_error: mutating queries are not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bCREATE\b|\bMERGE\b|\bDELETE\b|\bSET\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "mutating queries are not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-mutation.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
