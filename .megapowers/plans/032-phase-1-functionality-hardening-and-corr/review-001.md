---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 2
  - 4
  - 1
  - 3
approved_tasks:
  - 2
  - 4
needs_revision_tasks:
  - 1
  - 3
---

### Task 1: Refresh stale persisted graph before serving tool results — ❌ REVISE
- Coverage is close, but Step 3 does not fully fix the diagnosed freshness problem. It proposes `store.getStatistics(projectRoot)` as the gate, but `src/graph/sqlite.ts:getStatistics()` only compares hashes for already-tracked files. It does not detect newly added `.ts/.tsx` files or deleted tracked files when no existing file hash changed.
- Because `src/indexer/pipeline.ts:indexProject()` is already incremental, the safer minimal plan is to re-run `indexProject()` on every tool invocation and let it skip unchanged files / reconcile changed, new, and removed files.
- As written, AC 1 and AC 2 are only partially covered.

### Task 2: Make trace report ambiguous symbol matches explicitly — ✅ PASS
No issues.

### Task 3: Make impact reject ambiguous symbol seeds — ❌ REVISE
- Step 3 changes the exported `collectImpact()` API from `symbols: string[]` to `nodeIds: string[]`. That is not compatible with the real codebase: `test/tool-impact.test.ts` already calls `collectImpact({ symbols: [...] ... })` in multiple tests.
- This violates self-containment/codebase realism and would break Step 5 (`bun test`) even if the new ambiguity test passed.
- The task should preserve `collectImpact()`’s existing signature and limit the ambiguity behavior to the user-facing `impact()` wrapper, which is what the new regression test actually exercises.

### Task 4: Accept single-quoted WHERE string literals in graph_query — ✅ PASS
No issues.

### Missing Coverage
- No completely missing acceptance criteria, but AC 1 / AC 2 are not fully satisfied by Task 1’s current implementation because the proposed freshness gate misses added/removed files in persisted non-empty DB scenarios.

### Verdict
- **revise** — Task 1 and Task 3 need adjustment before the plan is ready for implementation.

I wrote prescriptive revision guidance to `.megapowers/plans/032-phase-1-functionality-hardening-and-corr/revise-instructions-1.md`.
