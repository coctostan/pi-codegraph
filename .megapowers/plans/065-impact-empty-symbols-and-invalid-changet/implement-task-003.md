# Task 3 implementation

Completed Task 3: reject invalid `changeType` at the `impact()` tool entry.

## Changes
- Added a regression test for invalid `changeType` in `test/tool-impact-empty-symbols.test.ts`
- Added `validChangeTypes` validation in `src/tools/impact.ts` before symbol resolution

## TDD evidence
- RED: `bun test test/tool-impact-empty-symbols.test.ts` failed with missing `changeType` diagnostic
- GREEN: `bun test test/tool-impact-empty-symbols.test.ts` passed (3 tests)
- Regression: `bun test` passed (447 tests)
