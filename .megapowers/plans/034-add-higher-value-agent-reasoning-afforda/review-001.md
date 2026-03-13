---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 3
  - 4
  - 5
  - 6
  - 7
  - 1
  - 2
  - 8
approved_tasks:
  - 3
  - 4
  - 5
  - 6
  - 7
needs_revision_tasks:
  - 1
  - 2
  - 8
---

## Per-Task Assessment

### Task 1: Extract `is_exported` metadata — ❌ REVISE
- Adding required `is_exported: boolean` to `GraphNode` will break all ~50+ existing tests that create `GraphNode` literals without the field. Step 5 (`bun test` all passing) is impossible. Must make it `is_exported?: boolean` (optional).

### Task 2: Persist `is_exported` in SQLite — ❌ REVISE
- Minor: Step 3 must note that `ALTER TABLE ADD COLUMN` yields NULL for existing rows, and hydration must coerce `null` → `false`. Without this, existing nodes will have `is_exported: null` instead of `false`.

### Task 3: Shared signal computer — ✅ PASS
- Well-structured, correct dependencies, focused scope.

### Task 4: Rank impact dependents — ✅ PASS
- Sound approach with backward compat for `collectImpact`.

### Task 5: Always-on impact annotations — ✅ PASS
- Correctly builds on Task 4, tests annotation format.

### Task 6: symbol_graph inline tags — ✅ PASS
- Correct dependencies, preserves unresolved rows.

### Task 7: trace inline tags — ✅ PASS
- Correct dependencies, preserves mode header.

### Task 8: Performance caching — ❌ REVISE
- Step 2 expected failure is unreliable — 120 in-memory symbols may already complete under 1s without memoization. Must acknowledge the test may pass immediately and serves as a regression guard.

## Missing Coverage
All 14 ACs are covered across tasks. AC 13's regression tests are distributed across tasks 3-7 which is acceptable.

## Verdict: REVISE
Task 1 is the blocking issue — required field on GraphNode breaks all existing tests. Tasks 2 and 8 have minor issues. See revise-instructions-1.md for specific fixes.
