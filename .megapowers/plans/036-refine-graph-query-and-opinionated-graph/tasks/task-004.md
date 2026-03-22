---
id: 4
title: Compile CONTAINS predicates to parameterized SQL
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/graph-query-compiler.ts
files_to_create:
  - test/graph-query-compiler-contains.test.ts
---

### Task 4: Compile CONTAINS predicates to parameterized SQL [depends: 3]

**Files:**
- Create: `test/graph-query-compiler-contains.test.ts`
- Modify: `src/tools/graph-query-compiler.ts`
- Test: `test/graph-query-compiler-contains.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-compiler-contains.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits parameterized LIKE SQL for CONTAINS predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name CONTAINS "Handler" RETURN n.name LIMIT 2',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("n0.name LIKE ?");
  expect(compiled.sql).not.toContain("Handler");
  expect(compiled.params).toEqual(["%Handler%", 2]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-compiler-contains.test.ts`
Expected: FAIL — `expect(received).toContain("n0.name LIKE ?")`

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
    wheres.push(`${tableAlias}.${predicate.property} = ?`);
    params.push(predicate.value);
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-compiler-contains.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
