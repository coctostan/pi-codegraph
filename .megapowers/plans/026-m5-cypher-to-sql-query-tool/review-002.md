---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 4
  - 5
  - 6
  - 7
  - 9
  - 10
  - 3
  - 8
approved_tasks:
  - 1
  - 2
  - 4
  - 5
  - 6
  - 7
  - 9
  - 10
needs_revision_tasks:
  - 3
  - 8
---

## Per-Task Assessment

### Task 1: Add read-only SQL queryRows to GraphStore — ✅ PASS
Clean TDD, correct APIs, covers the foundation for parameterized SQL execution.

### Task 2: Parse supported Cypher subset into AST — ✅ PASS
Good coverage of AC #3-16. Parser implementation is correct for the strict subset.

### Task 3: Classify parse validation and unsupported query errors — ❌ REVISE
Step 3 is a collection of disconnected code fragments (loose constants, modified function signatures, statements outside any function context). The implementer cannot apply this as-is. Needs the complete `graph-query-parser.ts` file since nearly every function changes. Also: the `MATCH (a) RETURN` test case may not produce the expected error message — needs verification.

### Task 4: Compile parsed graph queries to parameterized SQL — ✅ PASS
Correct SQL generation with bound parameters. Test validates shape and ordering.

### Task 5: Render structured graph query rows as anchored output — ✅ PASS
Correct use of `computeAnchor`, covers stale markers, empty results, edge rendering.

### Task 6: Execute node-only graph queries end to end — ✅ PASS
Clean e2e test with real store and file system.

### Task 7: Return execution_error when compiled SQL execution fails — ✅ PASS
Correct error handling with fake store.

### Task 8: Execute traversal queries without edge aliases — ❌ REVISE
Step 3 shows two comment-level regex snippets but not complete functions. The traversal extraction regex from Task 2 has bugs for incoming edges (`<[...]` doesn't match `<-[...]`), and the fix needs to handle the full `(b)<-[:calls]-(a)` Cypher form including the trailing dash. Needs complete modified functions.

### Task 9: Return parse_error for blank graphQuery input — ✅ PASS
Simple defensive check with correct TDD.

### Task 10: Register graph_query in the pi extension — ✅ PASS
Follows existing tool registration patterns. Covers AC #1 and #2.

## Missing Coverage
ACs 43-45 (WHERE filtering, RETURN projections, LIMIT as e2e tests) are only incidentally tested via Tasks 6 and 8 rather than as primary test subjects. This is borderline acceptable given strong unit test coverage in Tasks 2-5, but worth noting.

## Verdict
Tasks 3 and 8 need revision — both have incomplete Step 3 implementations that cannot be applied by the implementer. See revise-instructions-2.md for specifics.
