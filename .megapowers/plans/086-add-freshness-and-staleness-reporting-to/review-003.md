---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 4
  - 6
  - 3
  - 5
approved_tasks:
  - 1
  - 2
  - 4
  - 6
needs_revision_tasks:
  - 3
  - 5
---

### Task 1: Add shared result-scoped freshness evaluator — ✅ PASS
No issues.

### Task 2: Strip compact freshness headers — ✅ PASS
No issues.

### Task 3: Report symbol graph freshness — ❌ REVISE
- Granularity: Step 1 has one test named `symbolGraph reports stale target and partial stale neighborhood evidence` that covers fresh output, partial stale neighborhood evidence, and stale target state in one `test(...)`. Split stale target and stale neighborhood into focused tests in the same file.
- TDD/full-suite realism: existing-test update instructions are incomplete. `test/tool-symbol-graph-trust-header.test.ts` has legacy `freshLines[1]/[2]` and `mixedLines[1]/[2]` assertions that will remain if the implementer only follows the current “replace first-line assertions” instruction. Those legacy `status:`/`evidence:` assertions must be removed/replaced.
- TDD/full-suite realism: `test/tool-symbol-graph-contract-include.test.ts` has two `## Trust` count assertions; the task should explicitly update both.

### Task 4: Warn on stale impact results — ✅ PASS
No issues.

### Task 5: Warn on unreliable coverage trace freshness — ❌ REVISE
- TDD/full-suite realism: existing trace test update instructions are incomplete for header line-index changes. For example, `test/tool-trace-trust-heuristic.test.ts` and `test/tool-trace-static-mode-header.test.ts` still have legacy `status:`/`evidence:` line-index assertions unless the full assertion block is replaced.
- TDD correctness: the instruction for `test/tool-trace-signals.test.ts` is wrong. That existing test is a stale coverage trace seeded with fake content hashes, so it should expect `Trust: partial` and `mode: coverage [stale]`, not `Trust: fresh` or static mode.
- TDD/full-suite realism: `test/tool-trace-trust-runtime.test.ts` needs full fresh/mixed header block replacements, not just first-line status changes, or old evidence/mode indexes will fail.

### Task 6: Report stale static trace call edges — ✅ PASS
No issues.

### Missing Coverage
No missing acceptance-criterion labels. AC 1-15 are all referenced by at least one task.

### Verdict
revise — Tasks 3 and 5 need targeted updates. I wrote `.megapowers/plans/086-add-freshness-and-staleness-reporting-to/revise-instructions-3.md` with exact replacement snippets.
