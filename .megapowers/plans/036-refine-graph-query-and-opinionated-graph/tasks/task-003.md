---
id: 3
title: Parse CONTAINS predicates in WHERE clauses
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-contains.test.ts
---

### Task 3: Parse CONTAINS predicates in WHERE clauses [depends: 2]

**Files:**
- Create: `test/graph-query-parser-contains.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-contains.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-parser-contains.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery preserves CONTAINS predicates in WHERE clauses", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name CONTAINS "Handler" RETURN n.name LIMIT 2',
  );

  expect(ast.where).toEqual([
    { alias: "n", property: "name", operator: "CONTAINS", value: "Handler" },
  ]);
  expect(ast.limit).toBe(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-contains.test.ts`
Expected: FAIL — `parse_error: invalid WHERE predicate: n.name CONTAINS "Handler"`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, change `WhereClause` to:
```ts
export interface WhereClause {
  alias: string;
  property: string;
  operator?: "CONTAINS";
  value: string;
}
```

Then replace `parseWhere()` with:
```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError(
      "unsupported_error",
      "OR is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece
      .trim()
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(=|CONTAINS)\s*(?:"([^"]*)"|'([^']*)')$/i);
    if (!match) {
      throw new GraphQueryError(
        "parse_error",
        `invalid WHERE predicate: ${piece.trim()}`,
        'MATCH (a) WHERE a.name = "foo" RETURN a',
      );
    }

    const rawOperator = match[3]!.toUpperCase();
    return {
      alias: match[1]!,
      property: match[2]!,
      operator: rawOperator === "CONTAINS" ? "CONTAINS" : undefined,
      value: match[4] ?? match[5] ?? "",
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-contains.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
