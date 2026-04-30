---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 6
  - 1
  - 2
  - 3
  - 4
  - 5
approved_tasks:
  - 6
needs_revision_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
---

### Task 1: Add shared result-scoped freshness evaluator — ❌ REVISE
- Granularity: Step 1 puts fresh, stale target, stale neighbor, stale edge, deleted file, timestamp, and formatting assertions in one `test(...)`. Split into focused tests so failures identify one evaluator behavior.

### Task 2: Strip compact freshness headers — ❌ REVISE
- Granularity: Step 1 combines `suppressFreshTrustHeader()` legacy-only behavior with `stripTrustHeader()` compact/legacy behavior in one test. Split into focused tests.

### Task 3: Report symbol graph freshness — ❌ REVISE
- Coverage/self-containment: `collectSymbolGraphScope()` over-collects every stored neighbor/edge, including omitted neighbors, so freshness is not strictly computed from returned result items as required by AC 1.
- TDD/full-suite realism: the task changes `symbolGraph()` from `## Trust` blocks to `Trust: ...`, but does not update existing symbol_graph/extension tests that assert legacy trust headers. `bun test` will fail.

### Task 4: Warn on stale impact results — ❌ REVISE
- TDD/full-suite realism: the task changes `impact()` trust output, but only adds a new test. Existing impact tests still assert `## Trust`/`status: ...`, so Step 5 `bun test` will fail unless those tests are updated.

### Task 5: Warn on unreliable coverage trace freshness — ❌ REVISE
- Granularity: Step 1 combines unresolved stored steps, stale trace steps, deleted files, and warning assertions in one test. Split into focused tests.
- TDD/full-suite realism: the task changes `trace()` trust output, but existing trace/extension tests still assert legacy `## Trust`, `status: heuristic`, and `status: runtime-backed` headers. Step 5 `bun test` will fail unless those tests are updated.

### Task 6: Report stale static trace call edges — ✅ PASS
No issues with this task itself; it correctly depends on Task 5 and adds stale static call-edge coverage plus final `bun test && bun run check` verification.

### Missing Coverage
No acceptance criteria are missing by task label. Mechanically, AC 1-15 are all referenced by at least one task. However, AC 1 is not correctly implemented in Task 3 because the symbol_graph scope can include unreturned neighbors, and AC 14/15 are not realistically satisfied until existing affected tests are updated so the full suite can pass.

### Verdict
revise — specific revise instructions were written to `.megapowers/plans/086-add-freshness-and-staleness-reporting-to/revise-instructions-2.md`.
