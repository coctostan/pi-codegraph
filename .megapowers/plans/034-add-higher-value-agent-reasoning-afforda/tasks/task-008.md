---
id: 8
title: Cache signal computation for impact-scale performance
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/output/signals.ts
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-performance.test.ts
---

**Files:**
- Create: `test/tool-impact-performance.test.ts`
- Modify: `src/output/signals.ts`
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-performance.test.ts`

**TDD Steps:**
1. Add a performance regression test that builds an in-memory graph with 120 impacted symbols, calls `impact(...)`, asserts 120 annotated lines are returned, and requires total render time under one second.
2. Run `bun test test/tool-impact-performance.test.ts`. If it already passes because the 120-symbol in-memory graph renders under one second, treat it as a regression guard and continue; if it fails, the expected failure is the timing assertion for the under-one-second threshold. Either way, proceed to Step 3 to add memoization so the test remains green as the graph scales.
3. Add memoization to `createSignalComputer(...)` for base signals, module lookup, and changed-set co-change scores, then thread a single `SignalComputer` instance through `collectImpactDetails(...)` and `impact(...)` so traversal, ranking, and rendering share cached results.
4. Re-run `bun test test/tool-impact-performance.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
