## Task 3: Classify parse validation and unsupported query errors

This task has two concrete problems:

1. **Step 2 failure message is wrong for the code shown.**
   In `src/tools/graph-query-parser.ts`, `splitClauses()` checks clause counts before the `expected MATCH ... RETURN ...` regex. For the test case:
   ```ts
   'MATCH (a {name: "foo"}) RETURN'
   ```
   the thrown message will be:
   ```ts
   'query must contain exactly one RETURN clause'
   ```
   not `expected MATCH ... RETURN ...`.

2. **Coverage is incomplete for AC 3, AC 4, and the invalid side of AC 13.**
   The spec requires exactly one `MATCH`, exactly one `RETURN`, and `LIMIT` to be a positive integer. Add explicit test cases for:
   ```ts
   'MATCH (a {name: "foo"}) MATCH (b {name: "bar"}) RETURN a'
   'MATCH (a {name: "foo"}) RETURN a RETURN a.name'
   'MATCH (a {name: "foo"}) RETURN a LIMIT 0'
   ```
   and assert:
   ```ts
   'query must contain exactly one MATCH clause'
   'query must contain exactly one RETURN clause'
   'LIMIT must be a positive integer'
   ```

Keep this task focused on parser behavior. Do not use `graphQuery()` here.

## Task 8: Execute traversal queries with WHERE projections and LIMIT

This task is not currently a valid RED → GREEN step.

- The Step 2 expected failure is incorrect. After Tasks 2, 4, 6, and 7, the query in Step 1 is already supported by the parser/compiler shape shown in the plan, so it will not fail with:
  ```ts
  parse_error: invalid edge pattern
  ```
- Step 3 mostly re-pastes the existing compiler and `graphQuery()` implementation instead of introducing a new minimal change.

Replace this task with a traversal behavior that is **not already covered by Tasks 2, 4, and 6** and that maps to a real acceptance criterion gap. Recommended replacement:

### New Task 8 scope
Cover **queries with no edge alias** to prove AC 9 (edge alias is optional).

### Revised Step 1 test shape
Use:
```ts
const output = graphQuery({
  query: 'MATCH (a {name: "foo"})-[:calls]->(b {kind: "function"}) WHERE b.name = "bar" RETURN a, b.file LIMIT 1',
  store,
  projectRoot,
});

expect(output).toContain('rows: 1');
expect(output).toContain('a: src/a.ts:1:');
expect(output).toContain('b.file: src/b.ts');
```

### Revised Step 2
Make the failing expectation match the actual missing behavior you introduce. If the current parser/compiler already handles omitted edge aliases, then this task should be replaced entirely with another uncovered behavior instead of forcing an artificial failure.

### Revised Step 3
Only modify the smallest code path needed for the new failing test. Do **not** paste the full contents of `src/tools/graph-query.ts` and `src/tools/graph-query-compiler.ts` if only one branch changes.

## Task 9: Surface parser and validation failures through graphQuery output

This task is also not a valid RED → GREEN step.

- After Task 6, `graphQuery()` already formats `GraphQueryError` as:
  ```ts
  `${error.kind}: ${error.message}\n`
  ```
- The Step 1 test fails only because it hard-codes a parser message that conflicts with Task 3’s implementation (`query must contain exactly one RETURN clause` vs `expected MATCH ... RETURN ...`).
- Step 3 adds a small helper but does not actually change observable behavior.

Replace this task with an uncovered observable behavior. Recommended replacement:

### New Task 9 scope
Cover **zero-row tool output** end to end for AC 23.

### Revised Step 1 test shape
```ts
import { expect, test } from 'bun:test';
import { SqliteGraphStore } from '../src/graph/sqlite.js';
import { graphQuery } from '../src/tools/graph-query.js';

test('graphQuery returns rows: 0 for a valid query with no matches', () => {
  const store = new SqliteGraphStore();
  try {
    const output = graphQuery({
      query: 'MATCH (a {name: "missing"}) RETURN a',
      store,
      projectRoot: '/tmp/project',
    });

    expect(output).toBe('rows: 0\n');
  } finally {
    store.close();
  }
});
```

### Revised Step 2
If `renderGraphQueryRows()` already returns `rows: 0\n`, then replace this task with another uncovered end-to-end behavior instead of wrapping existing behavior in a no-op refactor.

### Alternative uncovered behavior
If AC 23 is already sufficiently covered elsewhere after revision, use this task for AC 1/2 tool-path behavior only if it can be made a true RED → GREEN change.

## Task 10: Register graph_query in the pi extension

Once Tasks 8 and 9 are revised, re-check dependencies.

- If the revised Task 8 no longer changes `src/tools/graph-query.ts`, Task 10 should not depend on it unless it truly uses code introduced there.
- If the revised Task 9 is replaced with a zero-row integration test and does not produce new implementation needed by the extension, Task 10 should not depend on Task 9 either.

Keep dependencies minimal and only point to tasks whose outputs are actually required by the code in Step 3.
