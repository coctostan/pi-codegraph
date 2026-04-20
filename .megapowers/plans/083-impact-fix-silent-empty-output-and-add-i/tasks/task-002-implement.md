# Implement Task 002 — Add diagnostic empty-hits message to `impact()`

## RED
- Added test: `test/tool-impact-empty-diagnostic.test.ts`
- Ran: `bun test test/tool-impact-empty-diagnostic.test.ts`
- Observed expected failure:
  - entry-point, interface, isolated, and mixed-order cases all failed because `impact()` returned only the trust header with an empty body when `hits.length === 0`

## GREEN
- Updated `src/tools/impact.ts` to build per-seed empty-impact diagnostics for:
  - entry points with no callers
  - interfaces with no implementors/dependents
  - genuinely isolated symbols
- Re-ran: `bun test test/tool-impact-empty-diagnostic.test.ts`
- Result: `4 pass, 0 fail`

## Regression check
- Ran: `bun test`
- Result: `384 pass, 1 fail`
- Remaining failure is in `test/tool-impact-083-repro.test.ts` and matches planned follow-on Task 3:
  - interface reproduction expectation still assumes the old empty-result diagnostic path instead of the final implements traversal output
