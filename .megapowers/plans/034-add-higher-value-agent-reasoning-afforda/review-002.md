---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 6
  - 8
  - 3
  - 4
  - 5
  - 7
approved_tasks:
  - 1
  - 2
  - 6
  - 8
needs_revision_tasks:
  - 3
  - 4
  - 5
  - 7
---

## Per-Task Assessment\n\n### Task 1 — ✅ PASS\n### Task 2 — ✅ PASS\n### Task 3 — ❌ REVISE: The co-change test's `formatImpactWhy` assertion misses the \"leaf\" role tag. The `candidate` node has `fanOut=0`, making it a leaf, but the assertion expects `[fan-in:0, untested, ...]` without \"leaf\".\n### Task 4 — ❌ REVISE: Test expects 3 results but BFS will return 6 because `a1`, `a2`, `a3` are also impacted dependents at depth 2.\n### Task 5 — ❌ REVISE: `test/extension-impact.test.ts` uses exact regex patterns on impact output lines. After appending annotations, those regexes will fail at Step 5.\n### Task 6 — ✅ PASS\n### Task 7 — ❌ REVISE: `prod` has no outbound calls edge, giving it `fanOut=0` and an unexpected \"leaf\" tag. Test expects `[entry-point, tested]` but actual is `[entry-point, leaf, tested]`.\n### Task 8 — ✅ PASS\n\nSee revise-instructions-2.md for prescriptive fixes with exact code.
