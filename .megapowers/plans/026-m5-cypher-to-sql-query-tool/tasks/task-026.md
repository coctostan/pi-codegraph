---
id: 26
title: Reject variable-length paths
status: approved
depends_on:
  - 25
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-unsupported-variable-length.test.ts
---

### Task 26: Reject variable-length paths [depends: 25]

**Covers AC:** 33

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-variable-length.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for variable-length paths", () => {
  expect(() => parseGraphQuery('MATCH (a)-[*]->(b) RETURN a'))
    .toThrowError(/variable-length paths are not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-variable-length.test.ts`
Expected: FAIL — parser currently returns parse_error for `MATCH (a)-[*]->(b) RETURN a` instead of `unsupported_error: variable-length paths are not supported`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function rejectUnsupported(query: string): void {
  if (/\[\s*\*[^\]]*\]/.test(query)) {
    throw new GraphQueryError("unsupported_error", "variable-length paths are not supported");
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-variable-length.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
