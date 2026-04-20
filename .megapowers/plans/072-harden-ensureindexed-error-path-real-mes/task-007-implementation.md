# Task 7 — RC-D stickiness: clear lastIndexError on evidence of store health

Implemented transient `lastIndexError` clearing after successful read-only tool output, while preserving the verified readonly case.

## Changes
- `src/index.ts`
  - added `setLastIndexErrorForTesting(error: Error | null)`
  - updated `finalizeReadOnlyOutput(...)` to clear `lastIndexError` after rendering the current call's indexing-failed note when:
    - the store read path produced non-empty output, and
    - the current error message is not `"readonly database"`
  - kept the clear decision after note construction so the current call still surfaces the captured transient message
- `test/last-index-error-clear-on-health.test.ts`
  - added coverage for transient error clearing, readonly error preservation, and the new test setter

## TDD
- RED: `bun test test/last-index-error-clear-on-health.test.ts`
  - failed with `TypeError: mod.setLastIndexErrorForTesting is not a function`
- GREEN: `bun test test/last-index-error-clear-on-health.test.ts`
  - passed
- Regression: `bun test`
  - passed (`374 pass, 0 fail`)
