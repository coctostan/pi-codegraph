---
id: 22
title: Reject OPTIONAL MATCH
status: approved
depends_on:
  - 14
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-unsupported-optional-match.test.ts
---

### Task 22: Reject OPTIONAL MATCH [depends: 14]

**Covers AC:** 29

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-optional-match.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for OPTIONAL MATCH", () => {
  expect(() => parseGraphQuery('OPTIONAL MATCH (a {name: "foo"}) RETURN a'))
    .toThrowError(/OPTIONAL MATCH is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-optional-match.test.ts`
Expected: FAIL — parseGraphQuery currently throws parse_error (`expected MATCH ... RETURN ...`) instead of unsupported_error (`OPTIONAL MATCH is not supported`)

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\bOPTIONAL\s+MATCH\b/i.test(query)) {
    throw new GraphQueryError("unsupported_error", "OPTIONAL MATCH is not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-optional-match.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
