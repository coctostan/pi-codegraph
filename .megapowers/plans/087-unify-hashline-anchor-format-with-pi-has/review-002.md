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
  - 10
  - 11
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
  - 11
needs_revision_tasks:
  - 3
  - 8
  - 9
---

### Task 1: Add pi-hashline-compatible line hash helper — ✅ PASS
No issues.

### Task 2: Switch computeAnchor to bare editable anchors — ✅ PASS
No issues.

### Task 3: Initialize hash helper in extension tools — ❌ REVISE
- Step 1 asserts `expect(text).toContain("src/foo.ts")`, but Task 3 runs before Tasks 5-7 introduce file-separated rendering. At Task 3, `symbolGraph` default/card output still renders only bare `anchor.anchor`; after Step 3, the test would still fail even if `ensureHashInit()` is correctly awaited.
- Replace the file-path assertion with assertions focused only on hash initialization, e.g. `expect(text).toContain("## foo (function)")`, `expect(text).toMatch(/\b1:c27\b/)`, and `expect(text).not.toContain("Hash not initialized")`.

### Task 4: Initialize direct test hash runtime — ✅ PASS
No issues.

### Task 5: Render neighborhood anchors with separate file context — ✅ PASS
No issues.

### Task 6: Render symbol-resolution candidates with separate file context — ✅ PASS
No issues.

### Task 7: Render symbol card anchors with separate file context — ✅ PASS
No issues.

### Task 8: Render impact anchors with separate file context — ❌ REVISE
- Step 2's expected RED explanation is inaccurate. After Task 2, impact output will have a bare `LINE:HASH` anchor without file context, not the old `src/caller.ts:2:<4hex>` shape. The positive file-separated regex is still valid; update the expected failure reason to say the file path is missing.

### Task 9: Render trace anchors with separate file context — ❌ REVISE
- Step 2's expected RED explanation is inaccurate. After Task 2, trace rows and file-scoped miss candidates use bare `LINE:HASH` anchors without file context, not the old `file:line:4hex` shape. Update the failure explanation accordingly.

### Task 10: Render source snippets with compatible line hashes — ✅ PASS
No issues.

### Task 11: Update anchor-format documentation — ✅ PASS
No issues.

### Missing Coverage
No acceptance criteria are missing by task coverage reference. I mechanically checked AC references across `spec.md`, `plan.md`, and task files; every AC 1-20 is referenced by at least one task.

### Verdict
revise — Tasks 3, 8, and 9 need targeted TDD correctness fixes. See `.megapowers/plans/087-unify-hashline-anchor-format-with-pi-has/revise-instructions-2.md`.
