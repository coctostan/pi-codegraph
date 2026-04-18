---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
approved_tasks:
  - 1
needs_revision_tasks:
  - 2
---

### Task 1: Clarify the registered symbol_graph contract — ✅ PASS
No issues.

### Task 2: Document valid symbol_graph include values in public docs — ❌ REVISE
- Step 1 weakens the existing unified-surface regression by replacing `test/docs-symbol-graph-unified-surface.test.ts` and dropping the current README assertions that `#### `symbol_card`` and `#### `symbol_contract`` are absent. Keep those assertions while adding the new include-guidance checks.
- Step 3 is not self-contained as written: the README replacement snippet is malformed. The outer ```md fence closes before the example code block opens, and there is an extra trailing fence. A developer cannot copy the block as-is without reconstructing the intended markdown.

### Missing Coverage
None at the plan level. `plan.md` maps all three Fixed When criteria to Tasks 1 and 2, and the task bodies cover the contract wording, the default-vs-include distinction, and the doc/test sync requirements.

### Verdict
revise
