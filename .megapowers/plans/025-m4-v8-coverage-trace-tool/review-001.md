---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 2
  - 3
  - 7
  - 1
  - 4
  - 5
  - 6
  - 8
  - 9
approved_tasks:
  - 2
  - 3
  - 7
needs_revision_tasks:
  - 1
  - 4
  - 5
  - 6
  - 8
  - 9
---

### Task 1: Add deterministic V8 coverage parser — ❌ REVISE
- **Granularity:** single test covers multiple independent behaviors (input discovery, filtering, malformed-entry handling, ordering). Split to one primary behavior for this task.
- **Coverage annotation missing:** task does not explicitly list AC IDs.

### Task 2: Map coverage ranges to graph nodes — ✅ PASS
- Dependency on Task 1 is correct.
- TDD steps are coherent and API usage matches existing `GraphStore` (`getNodesByFile`).

### Task 3: Persist coverage-backed test traces in SQLite — ✅ PASS
- Dependency ordering is correct.
- Store API/schema changes are realistic for current codebase (`SqliteGraphStore` + `GraphStore` interface).

### Task 4: Index coverage artifacts into tested_by edges and stored traces — ❌ REVISE
- **Spec mismatch (AC7):** edge direction is reversed versus acceptance wording. Task currently uses `test -> prod`; spec requires `prod -> test`.
- Step 1 assertions also enforce the reversed direction and must be updated.
- Coverage annotation missing.

### Task 5: Return coverage-backed traces for tests and production symbols — ❌ REVISE
- Must be updated to match corrected `tested_by` edge direction from Task 4 (`prod -> test`).
- Current selection logic queries inbound `tested_by`; with corrected direction it must query outbound.
- Coverage annotation missing.

### Task 6: Resolve endpoint entries to coverage-backed traces — ❌ REVISE
- Depends on Task 5 selection logic; must inherit the corrected `tested_by` traversal semantics.
- Coverage annotation missing.

### Task 7: Fall back to deterministic static traces when coverage is missing — ✅ PASS
- Dependency and TDD flow are coherent.
- Static traversal uses deterministic ordering and is self-contained.

### Task 8: Mark stale and unresolved trace steps without failing the trace — ❌ REVISE
- Must stay consistent with corrected `tested_by` direction in shared coverage-resolution path.
- Coverage annotation missing.

### Task 9: Wire the trace tool into the extension — ❌ REVISE
- **Granularity:** Step 1 introduces multiple tests across multiple files; task should be one failing test + one implementation.
- Keep this task focused on trace tool registration wiring only.
- Coverage annotation missing.

### Missing Coverage
- No AC is fully uncovered, but AC mapping is not explicit in task bodies. Add `ACs covered` lines so reviewers can verify traceability quickly.

### Ordering & Dependencies
- Dependency chain is mostly correct and acyclic.
- Direction fix in Task 4 must propagate to Tasks 5/6/8 to preserve dependency correctness.

### TDD Completeness
- Most Step 2/4/5 commands are appropriate for Bun (`bun test ...`, `bun test`).
- Main correctness risk is semantic (edge direction + downstream traversal), not command syntax.

I wrote prescriptive revisions to `.megapowers/plans/025-m4-v8-coverage-trace-tool/revise-instructions-1.md`.
