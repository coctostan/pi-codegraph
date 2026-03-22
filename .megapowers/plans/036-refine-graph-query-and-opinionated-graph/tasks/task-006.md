---
id: 6
title: Compile STARTS WITH predicates to parameterized SQL
status: approved
depends_on:
  - 4
  - 5
no_test: false
files_to_modify:
  - src/tools/graph-query-compiler.ts
files_to_create:
  - test/graph-query-compiler-starts-with.test.ts
---

### Task 6: Compile STARTS WITH predicates to parameterized SQL [depends: 4, 5]

**Files:**
- Create: `test/graph-query-compiler-starts-with.test.ts`
- Modify: `src/tools/graph-query-compiler.ts`
- Test: `test/graph-query-compiler-starts-with.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-compiler-starts-with.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits parameterized LIKE SQL for STARTS WITH predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name STARTS WITH "get" RETURN n.name LIMIT 4',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("n0.name LIKE ?");
  expect(compiled.sql).not.toContain("get");
  expect(compiled.params).toEqual(["get%", 4]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-compiler-starts-with.test.ts`
Expected: FAIL — `expect(received).toEqual(["get%", 4])`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-compiler.ts`, replace the `for (const predicate of ast.where)` loop with:
```ts
  for (const predicate of ast.where) {
    const tableAlias = nodeAliases[predicate.alias]!;
    if (predicate.operator === "CONTAINS") {
      wheres.push(`${tableAlias}.${predicate.property} LIKE ?`);
      params.push(`%${predicate.value}%`);
      continue;
    }
    if (predicate.operator === "STARTS WITH") {
      wheres.push(`${tableAlias}.${predicate.property} LIKE ?`);
      params.push(`${predicate.value}%`);
      continue;
    }
    wheres.push(`${tableAlias}.${predicate.property} = ?`);
    params.push(predicate.value);
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-compiler-starts-with.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
