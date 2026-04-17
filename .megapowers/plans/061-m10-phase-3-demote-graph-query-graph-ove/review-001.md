---
type: plan-review
iteration: 1
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
- Step 1 does not prove AC 8 / AC 19 (`default output is unchanged`). It only proves `include: []` matches the omitted path after the change. Both paths could still regress together.
- Add an exact regression lock for the current default `symbol_graph` output on the unique-symbol fixture before the `include: []` comparison.

### Task 5: Append shared contract output from symbol_graph include — ❌ REVISE
- Step 1 compares `symbol_graph` to `renderSymbolContractBody()` directly, but does not prove the standalone `symbol_contract()` tool uses the same path. AC 10 / AC 19 need the appended body to match the actual standalone tool path.
- Step 1's missing-symbol test is too weak. `expect(output).toContain('Symbol "doesNotExist" not found')` still passes if no contract section is appended.
- Step 3 explicitly says to leave the existing early returns in `src/tools/symbol-graph.ts` in place. That cannot satisfy AC 11, because the current not-found / ambiguous returns happen before any contract section can be appended.

### Task 6: Reconcile public, dev-mode, and internal docs — ✅ PASS
No issues.

### Missing Coverage
- No acceptance criteria are completely uncovered at the plan level, but AC 8 / AC 10 / AC 11 / AC 19 are not adequately locked by the current Task 4 / Task 5 test plan. Those tasks need the revisions called out above.

### Verdict
- **revise** — Tasks 4 and 5 need adjustment before implementation.
