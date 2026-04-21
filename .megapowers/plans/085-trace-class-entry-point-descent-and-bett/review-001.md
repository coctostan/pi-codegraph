---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
approved_tasks: []
needs_revision_tasks:
  - 1
---

## Per-Task Assessment

### Task 1: Repair trace entry handling — ❌ REVISE

- **Step 3 implementation has a missing type import.** The proposed `src/tools/trace.ts` replacement uses `NodeRole` in the signatures of `formatNodeLine` and `formatLiveTraceLine`, but the import block only imports `createSignalComputer`, `formatRoleTags`, and `type SignalComputer` from `../output/signals.js`. It is missing `type NodeRole`. Without this import the file will fail TypeScript type-checking because `NodeRole` is not in scope.

  Fix: change the import to:
  ```ts
  import { createSignalComputer, formatRoleTags, type NodeRole, type SignalComputer } from "../output/signals.js";
  ```

- **Granularity:** The task covers two distinct behavioral fixes (class handling from #079 and not-found messaging from #080) and references two reproduction test files. Since both fixes are localized to the same file (`src/tools/trace.ts`) and the reproduction tests already exist in the repo, keeping them in one task is acceptable. No split required, but the task description should make clear it is fixing both #079 and #080.

### Coverage
All 5 Fixed When acceptance criteria are covered:
1. Class no longer stops at bare class node marked `[leaf]` — covered by `repro-079-trace-class-entry-point.test.ts`
2. Non-class static traces unaffected — covered by existing `tool-trace-static-fallback.test.ts`
3. Truly missing lookup labeled as symbol failure — covered by `repro-080-trace-not-found-message.test.ts`
4. File-filter miss surfaces candidate locations — covered by `repro-080-trace-not-found-message.test.ts`
5. Ambiguity behavior unchanged — covered by existing `tool-trace-ambiguous.test.ts`

### Ordering & Dependencies
Single task with no dependencies. No issues.

### TDD Completeness
- Step 1: Tests already exist and correctly target the two bugs.
- Step 2: Expected failures match actual execution (verified by running the tests).
- Step 3: Implementation logic is correct for both bugs, but the missing `NodeRole` import will cause a type error.
- Step 4: Run command is correct.
- Step 5: Full suite run command is correct.

### Self-Containment
All referenced APIs (`store.findNodes`, `computeAnchor`, `prependTrustHeader`, `signalComputer.compute`, etc.) exist with the signatures used. The only self-containment defect is the missing `NodeRole` import.

## Missing Coverage
None.

## Verdict
**revise** — Task 1 needs the `NodeRole` type import added to the proposed `src/tools/trace.ts` replacement before implementation.
