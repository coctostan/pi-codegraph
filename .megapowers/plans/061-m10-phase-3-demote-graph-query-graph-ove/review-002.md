---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 6
  - 4
  - 5
approved_tasks:
  - 1
  - 2
  - 3
  - 6
needs_revision_tasks:
  - 4
  - 5
---

### Task 1: Add CODEGRAPH_DEVMODE parser helper — ✅ PASS
No issues.

### Task 2: Demote symbol_search from the registered extension surface — ✅ PASS
No issues.

### Task 3: Gate dev-only tool registration behind CODEGRAPH_DEVMODE — ✅ PASS
No issues.

### Task 4: Add symbol_graph include schema without changing default output — ❌ REVISE
- Step 1's exact-output assertion is incorrect. `formatNeighborhood()` always appends signal tags via `formatRoleTags()` (`src/output/anchoring.ts:127`). For the test fixture (`foo`, exported, no neighbors, no tests), the tags resolve to `[entry-point, leaf, untested]`, so the second body line is `${anchor} [entry-point, leaf, untested]`, not `${anchor}`.
- Step 4 will FAIL with a string mismatch as written. Update the expected string to include the tag suffix.

### Task 5: Append shared contract output from symbol_graph include — ❌ REVISE
- The success-path test is correct.
- The missing-symbol test will FAIL on Step 4. With the Step 3 implementation, the not-found body in `symbolGraph()` does not end with `\n`, so the append separator is `\n\n` per `body.endsWith("\n") ? "\n" : "\n\n"`. The test expects `\n${standaloneBody}` but the actual slice will be `\n\n${standaloneBody}`.
- Update the slice assertion to use `\n\n` for the empty-state path. (Alternatively, also add a `## Trust` count assertion to mirror the success-path test.)

### Task 6: Reconcile public, dev-mode, and internal docs — ✅ PASS
No issues.

### Missing Coverage
No acceptance criteria are completely uncovered. The remaining issues are TDD-correctness bugs in Tasks 4 and 5 that would cause the tests to fail their own Step 4 PASS gate.

### Verdict
- **revise** — Tasks 4 and 5 still have failing assertions that the implementation cannot satisfy. See `revise-instructions-2.md` for exact replacements.
