# Implement Task 8 — SqliteGraphStore file hash API: getFileHash/setFileHash

## Scope
Implemented Task 8 only (AC 39–41).

## RED
- Added file-hash API behavior test to `test/graph-store.test.ts`:
  - `getFileHash` returns `null` initially
  - `setFileHash` stores value
  - second `setFileHash` overwrites existing value
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `Not implemented: getFileHash`

## GREEN
- Implemented `getFileHash` and `setFileHash` in `src/graph/sqlite.ts` using planned SQL:
  - select hash by file
  - insert-or-replace with `indexed_at = Date.now()`
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `12 pass, 0 fail`
  - `tsc --noEmit` passed
