# Implement Task 9 — SqliteGraphStore lifecycle: close() and reopen persistence

## Scope
Implemented Task 9 only (AC 42).

## RED
- Added persistence lifecycle test to `test/graph-store.test.ts`:
  - write node to file-backed DB
  - `close()` first store
  - reopen store at same path
  - verify node still present
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `Not implemented: close`

## GREEN
- Implemented `close()` in `src/graph/sqlite.ts`:
  - calls `this.db.close()`
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `13 pass, 0 fail`
  - `tsc --noEmit` passed
