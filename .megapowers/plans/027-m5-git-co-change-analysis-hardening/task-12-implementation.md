# Task 12 — Update existing pipeline tests for new IndexResult shape

## What changed

- Updated `test/indexer-index-project.test.ts` to use `toMatchObject` for `indexProject(...)` result assertions that previously used strict `toEqual`.
- Updated 6 assertions to accommodate the new `timings` field added to `IndexResult`.
- Added `test/indexer-index-result-shape.test.ts` as a focused regression guard for summary-count compatibility plus `timings` presence.

## TDD evidence

### RED
- Existing failures after Task 11 (old strict shape checks):
  - `bun test` failed in `test/indexer-index-project.test.ts`.
  - `tsc --noEmit` failed due old `IndexResult` shape expectations.
- Additional explicit RED guard:
  - `bun test test/indexer-index-result-shape.test.ts` failed with strict `toEqual` against old shape.

### GREEN
- `bun test test/indexer-index-project.test.ts` → 5 pass, 0 fail
- `bun test test/indexer-index-result-shape.test.ts` → 1 pass, 0 fail

### Regression suite
- `bun test` → 193 pass, 0 fail
