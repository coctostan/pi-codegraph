# Implement Task 001

Completed Task 1: Add fresh-trust suppression helper.

## Changes
- Added `test/output-readonly-ceremony.test.ts` covering fresh, non-fresh, and body-only cases.
- Added `src/output/read-only-ceremony.ts` with `suppressFreshTrustHeader(text)`.

## TDD Log
- RED: `bun test test/output-readonly-ceremony.test.ts` failed with missing module `../src/output/read-only-ceremony.js`.
- GREEN: `bun test test/output-readonly-ceremony.test.ts` passed.
- REGRESSION: `bun test && bun run check` passed.
