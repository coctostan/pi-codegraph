---
id: 19
title: Reject RETURN clause without projections
status: approved
depends_on:
  - 11
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-return-empty.test.ts
---

### Task 19: Reject RETURN clause without projections [depends: 11]

**Covers AC:** 4, 24

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-return-empty.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when RETURN has no projections", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN'))
    .toThrowError(/query must contain exactly one RETURN clause/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-return-empty.test.ts`
Expected: FAIL — parser currently throws generic parse_error instead of explicit RETURN-count error

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function splitClauses(query: string): {
  matchClause: string;
  whereClause?: string;
  returnClause: string;
  limitClause?: string;
} {
  const normalized = query.trim();

  if ((normalized.match(/\bMATCH\b/gi) ?? []).length !== 1) {
    throw new GraphQueryError("parse_error", "query must contain exactly one MATCH clause");
  }

  if ((normalized.match(/\bRETURN\b/gi) ?? []).length !== 1 || /\bRETURN\s*$/i.test(normalized)) {
    throw new GraphQueryError("parse_error", "query must contain exactly one RETURN clause");
  }

  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-return-empty.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
