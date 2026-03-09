---
id: 12
title: Reject non-positive LIMIT values in parseGraphQuery
status: approved
depends_on:
  - 8
  - 11
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-limit.test.ts
---

### Task 12: Reject non-positive LIMIT values in parseGraphQuery [depends: 8, 11]

**Covers AC:** 13, 24

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-limit.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns parse_error when LIMIT is non-positive", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {name: "foo"}) RETURN a LIMIT 0'),
  ).toThrowError(/LIMIT must be a positive integer/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-limit.test.ts`
Expected: FAIL — parser currently accepts `LIMIT 0`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);
  const limit = limitClause ? Number(limitClause) : undefined;

  if (limit !== undefined && limit <= 0) {
    throw new GraphQueryError("parse_error", "LIMIT must be a positive integer");
  }

  const traversalMatch = matchClause.match(
    /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)(\([^\)]+\))$/,
  );

  if (traversalMatch) {
    const left = parseNodePattern(traversalMatch[1]!);
    const outgoingEdge = traversalMatch[2];
    const incomingEdge = traversalMatch[3];
    const right = parseNodePattern(traversalMatch[4]!);

    return {
      match: {
        left,
        edge: parseEdgePattern(outgoingEdge ? `${outgoingEdge}->` : `<-${incomingEdge!}`),
        right,
      },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause),
      limit,
    };
  }

  return {
    match: { left: parseNodePattern(matchClause) },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause),
    limit,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-limit.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
