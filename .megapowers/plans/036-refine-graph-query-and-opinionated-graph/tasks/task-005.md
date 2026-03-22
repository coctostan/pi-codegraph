---
id: 5
title: Parse STARTS WITH predicates in WHERE clauses
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-starts-with.test.ts
---

### Task 5: Parse STARTS WITH predicates in WHERE clauses [depends: 3]

**Files:**
- Create: `test/graph-query-parser-starts-with.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-starts-with.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-parser-starts-with.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery preserves STARTS WITH predicates in WHERE clauses", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name STARTS WITH "get" RETURN n.name LIMIT 4',
  );

  expect(ast.where).toEqual([
    { alias: "n", property: "name", operator: "STARTS WITH", value: "get" },
  ]);
  expect(ast.limit).toBe(4);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-starts-with.test.ts`
Expected: FAIL — `parse_error: invalid WHERE predicate: n.name STARTS WITH "get"`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, change `WhereClause` to:
```ts
export interface WhereClause {
  alias: string;
  property: string;
  operator?: "CONTAINS" | "STARTS WITH";
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
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(=|CONTAINS|STARTS WITH)\s*(?:"([^"]*)"|'([^']*)')$/i);
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
      operator:
        rawOperator === "CONTAINS"
          ? "CONTAINS"
          : rawOperator === "STARTS WITH"
            ? "STARTS WITH"
            : undefined,
      value: match[4] ?? match[5] ?? "",
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-starts-with.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
