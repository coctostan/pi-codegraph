---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 4
  - 6
  - 7
  - 9
  - 10
  - 3
  - 5
  - 8
approved_tasks:
  - 1
  - 2
  - 4
  - 6
  - 7
  - 9
  - 10
needs_revision_tasks:
  - 3
  - 5
  - 8
---

### Task 1: Add read-only SQL queryRows to GraphStore — ✅ PASS
No blocking issues. Dependencies, API usage (`GraphStore`/`SqliteGraphStore`), and TDD flow are realistic.

### Task 2: Parse supported Cypher subset into AST — ✅ PASS
Good foundation for accepted syntax. Uses correct project paths and Bun test conventions.

### Task 3: Classify parse validation and unsupported query errors — ❌ REVISE
- **Granularity issue:** one test loops through many distinct behaviors (parse, validation, unsupported categories). This violates the one-behavior-per-task expectation and makes failures non-local.
- Needs explicit AC mapping per narrowed scope.
- Recommendation captured in `revise-instructions-3.md`: split into behavior-focused tasks (clause-count parse errors, validation errors, unsupported syntax errors).

### Task 4: Compile parsed graph queries to parameterized SQL — ✅ PASS
Compiler task is coherent and correctly targets SQL shape + parameter ordering.

### Task 5: Render structured graph query rows as anchored output — ❌ REVISE
- **Granularity issue:** single test validates anchored nodes, edge rendering, stale markers, and zero-row behavior all at once.
- Should be split into focused tasks/tests aligned with AC 37/38/39/40.

### Task 6: Execute node-only graph queries end to end — ✅ PASS
Solid e2e for node match and anchored render path.

### Task 7: Return execution_error when compiled SQL execution fails — ✅ PASS
Covers AC 34 cleanly with a realistic failure mode.

### Task 8: Execute traversal queries without edge aliases — ❌ REVISE
- This task improves incoming/no-edge-alias traversal, but plan still lacks explicit **tool-level traversal edge-alias return** verification for structural/provenance output.
- Add a follow-up task that executes traversal with `RETURN r` and asserts kind + provenance fields in final tool output (AC 20, AC 21).

### Task 9: Return parse_error for blank graphQuery input — ✅ PASS
Reasonable guardrail task; implementation path is consistent with existing `graphQuery` error formatting.

### Task 10: Register graph_query in the pi extension — ✅ PASS
Correctly wires extension registration and auto-index behavior using existing `ensureIndexed` flow.

### Cross-cutting plan issue — ❌ REVISE
- Tasks do not explicitly annotate which AC IDs they cover. Coverage can be inferred, but this review requires explicit AC traceability in task definitions.

### Missing Coverage
- **AC 20, AC 21** are not explicitly covered by a tool-level traversal test that returns an edge alias and validates rendered structural/provenance fields end-to-end.
- AC traceability metadata is missing from task definitions (coverage is implicit rather than explicit).

I wrote prescriptive revisions to:
`.megapowers/plans/026-m5-cypher-to-sql-query-tool/revise-instructions-3.md`
