---
type: plan-review
iteration: 3
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
  - 11
approved_tasks:
  - 1
needs_revision_tasks:
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10
  - 11
---

### Task 1: Add pi-hashline-compatible line hash helper — ✅ PASS
No issues.

### Task 2: Switch computeAnchor to bare editable anchors — ❌ REVISE
- Ordering/TDD gate issue: after this task, `computeAnchor(...)` calls synchronous `computeLineHash(...)`, but direct Bun test preload is not added until current Task 4. Existing direct tests that render anchors will throw `Error: Hash not initialized — call ensureHashInit() first`, so Task 2 Step 5 (`bun test`) cannot honestly pass.
- Move the direct test hash preload task before this task, then make this task depend on it.

### Task 3: Initialize hash helper in extension tools — ❌ REVISE
- Same ordering/TDD gate issue: current Task 3 Step 5 (`bun test`) still cannot pass because the direct unit-test preload is current Task 4. Public extension initialization is useful, but it does not initialize direct unit tests.
- This task should run after the direct test preload and after the `computeAnchor` change.

### Task 4: Initialize direct test hash runtime — ❌ REVISE
- This is the right fix, but it is too late. Move it immediately after Task 1.
- Because it will then run before `computeAnchor` is changed, its Step 1 test must use `computeLineHash(...)`, not `computeAnchor(...)`.

### Task 5: Render neighborhood anchors with separate file context — ⚠️ METADATA REVISE
- Body is fine, but dependencies must be updated after reordering Tasks 2-4.

### Task 6: Render symbol-resolution candidates with separate file context — ⚠️ METADATA REVISE
- Body is fine, but dependencies must be updated after reordering Tasks 2-4.

### Task 7: Render symbol card anchors with separate file context — ⚠️ METADATA REVISE
- Body is fine, but dependencies must be updated after reordering Tasks 2-4.

### Task 8: Render impact anchors with separate file context — ⚠️ METADATA REVISE
- Body is fine after the last revision, but dependencies must be updated after reordering Tasks 2-4.

### Task 9: Render trace anchors with separate file context — ⚠️ METADATA REVISE
- Body is fine after the last revision, but dependencies must be updated after reordering Tasks 2-4.

### Task 10: Render source snippets with compatible line hashes — ⚠️ METADATA REVISE
- Body is fine, but dependencies must be updated after reordering Tasks 2-4.

### Task 11: Update anchor-format documentation — ⚠️ METADATA REVISE
- Body is fine, but dependencies and `plan.md` must be updated after reordering Tasks 2-4.

### Missing Coverage
No acceptance criteria are missing by task coverage reference.

### Verdict
revise — the plan is very close, but the direct test preload must move before the first task that makes synchronous anchor computation require initialization. See `.megapowers/plans/087-unify-hashline-anchor-format-with-pi-has/revise-instructions-3.md` for exact reorder and code changes.
