---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 4
  - 5
  - 6
  - 7
  - 10
  - 3
  - 8
  - 9
approved_tasks:
  - 1
  - 2
  - 4
  - 5
  - 6
  - 7
  - 10
needs_revision_tasks:
  - 3
  - 8
  - 9
---

### Per-Task Assessment

### Task 1: Add read-only SQL queryRows to GraphStore — ✅ PASS
No issues.

### Task 2: Parse supported Cypher subset into AST — ✅ PASS
No blocking issues. The task uses real Bun test conventions, valid file paths, and a plausible minimal parser shape.

### Task 3: Classify parse validation and unsupported query errors — ❌ REVISE
- **Step 2 expected failure is incorrect.** Given the Step 3 parser code, the query `MATCH (a {name: "foo"}) RETURN` will fail earlier with `query must contain exactly one RETURN clause`, not `expected MATCH ... RETURN ...`.
- **Coverage gap:** this is the natural place to cover AC 3 and AC 4 explicitly, but the task does not test multiple `MATCH` clauses or multiple `RETURN` clauses.
- **Coverage gap:** Step 3 implements `LIMIT must be a positive integer`, but the test does not cover that branch, so AC 13 is not fully mapped to a task.
- The task is still self-contained, but it needs its failing expectations and coverage tightened.

### Task 4: Compile parsed graph queries to parameterized SQL — ✅ PASS
No blocking issues. Realistic API usage and a valid compiler seam.

### Task 5: Render structured graph query rows as anchored output — ✅ PASS
No blocking issues. Uses existing `computeAnchor()` correctly and matches repo output conventions.

### Task 6: Execute node-only graph queries end to end — ✅ PASS
No blocking issues.

### Task 7: Return execution_error when compiled SQL execution fails — ✅ PASS
No blocking issues.

### Task 8: Execute traversal queries with WHERE projections and LIMIT — ❌ REVISE
- **Not a valid RED→GREEN step.** The query in Step 1 is already supported by the parser/compiler/tool shape introduced in Tasks 2, 4, 6, and 7. The claimed Step 2 failure `parse_error: invalid edge pattern` is not credible for the code shown.
- **Step 3 is largely a paste of existing implementation**, not a minimal change to make a failing test pass.
- This task should be replaced with a traversal behavior that is not already covered earlier and that maps to an actual acceptance-criteria gap.

### Task 9: Surface parser and validation failures through graphQuery output — ❌ REVISE
- **Not a valid RED→GREEN step.** Task 6 already formats `GraphQueryError` as `${error.kind}: ${error.message}\n`, so Step 3 does not introduce observable behavior.
- **Step 1 hard-codes a parser message that conflicts with Task 3’s own implementation** (`expected MATCH ... RETURN ...` vs `query must contain exactly one RETURN clause`).
- The current version is effectively a no-op refactor disguised as a behavior task. Replace it with a genuinely uncovered observable behavior.

### Task 10: Register graph_query in the pi extension — ✅ PASS
- The task itself is realistic and uses the existing extension wiring pattern correctly.
- After revising Tasks 8 and 9, re-check dependency minimization; current dependencies may be broader than needed.

### Missing Coverage
- **AC 3:** no task explicitly tests rejection of more than one `MATCH` clause.
- **AC 4:** no task explicitly tests rejection of more than one `RETURN` clause.
- **AC 13 (invalid side):** parser implementation includes non-positive `LIMIT` rejection, but no task tests it.

### Verdict
- **revise** — Tasks 3, 8, and 9 need adjustment before the plan is ready for implementation. The main issues are incorrect expected failures, duplicate/non-minimal implementation steps, and missing explicit coverage for several acceptance criteria.

