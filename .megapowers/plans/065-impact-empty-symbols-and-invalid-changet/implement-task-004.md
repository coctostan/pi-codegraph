# Task 4 implementation

Completed Task 4: short-circuit `collectImpactDetails` on empty/undefined `symbols` as defense-in-depth.

## Changes
- Added regression tests for `collectImpact()` with `symbols: undefined` and `symbols: []` in `test/tool-impact-empty-symbols.test.ts`
- Added an internal guard in `src/tools/impact.ts` so `collectImpactDetails()` returns `[]` for empty/undefined `symbols`

## TDD evidence
- RED: `bun test test/tool-impact-empty-symbols.test.ts` failed with `TypeError: undefined is not an object (evaluating 'symbols')`
- GREEN: `bun test test/tool-impact-empty-symbols.test.ts` passed (5 tests)
- Regression: `bun test` passed (449 tests)
- Typecheck: `bun run check` passed
