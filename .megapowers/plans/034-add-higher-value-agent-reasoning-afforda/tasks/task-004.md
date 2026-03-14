---
id: 4
title: Rank impact dependents and compute weakest-link path confidence
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-ranking.test.ts
---

**Files:**
- Create: `test/tool-impact-ranking.test.ts`
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-ranking.test.ts`

**TDD Steps:**
1. Add a new impact test that asserts `collectImpactDetails(...)` returns dependents ordered by priority and that transitive results carry weakest-link chain confidence, including the depth-2 behavioral `a1` / `a2` / `a3` callers reached through `shared <- api <- a*`.
2. Run `bun test test/tool-impact-ranking.test.ts` and confirm it fails because `collectImpactDetails` is not exported.
3. Replace `src/tools/impact.ts` with a version that adds `ImpactDetail`, deduplicates inbound callers by highest-confidence edge per hop, performs breadth-first traversal, records path confidence, uses the shared signal computer for ranking, preserves `collectImpact(...)` for backward compatibility, and keeps anchored output unchanged for now.
4. Re-run `bun test test/tool-impact-ranking.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
