---
id: 14
title: Reject OR predicates in graph query WHERE clauses
status: approved
depends_on:
  - 13
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-unsupported-or.test.ts
---

### Task 14: Reject OR predicates in graph query WHERE clauses [depends: 13]

**Covers AC:** 28

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-unsupported-or.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns unsupported_error for OR", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) WHERE a.name = "foo" OR a.kind = "function" RETURN a'))
    .toThrowError(/OR is not supported/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-unsupported-or.test.ts`
Expected: FAIL — parser currently returns parse_error for invalid WHERE predicate instead of unsupported_error

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];

  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError("unsupported_error", "OR is not supported");
  }

  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"$/);
    if (!match) {
      throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    }
    return { alias: match[1]!, property: match[2]!, value: match[3]! };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-unsupported-or.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
