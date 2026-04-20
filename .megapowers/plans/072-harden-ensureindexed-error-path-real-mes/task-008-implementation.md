# Task 8 — RC-D timestamp: indexingFailedNote emits age signal

Implemented timestamped `lastIndexError` state and age-aware indexing failure note formatting.

## Changes
- `src/index.ts`
  - replaced `lastIndexError: Error | null` with `IndexErrorRecord | null` storing `{ error, setAt }`
  - updated `getLastIndexErrorForTesting()` to preserve its `Error | null` return shape
  - extended `setLastIndexErrorForTesting(error, setAt?)` to accept an optional timestamp
  - added `getIndexingFailedNoteForTesting(now?)` for deterministic note-format assertions
  - updated `ensureIndexed(...)` to stamp all `lastIndexError` assignments with `Date.now()`
  - changed `indexingFailedNote()` to delegate to the shared age-formatting helper
  - updated `finalizeReadOnlyOutput(...)` to check `lastIndexError.error.message` for the readonly preservation path
- `test/indexing-failed-note-age.test.ts`
  - added deterministic coverage for `indexing-failed (<N>s ago): <msg>` formatting and prefix preservation

## TDD
- RED: `bun test test/indexing-failed-note-age.test.ts`
  - failed with `TypeError: mod.getIndexingFailedNoteForTesting is not a function`
- GREEN: `bun test test/indexing-failed-note-age.test.ts`
  - passed
- Regression: `bun test`
  - passed (`375 pass, 0 fail`)
