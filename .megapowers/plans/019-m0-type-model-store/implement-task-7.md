# Implement Task 7 — SqliteGraphStore invalidation: deleteFile removes file nodes and touching edges

## Scope
Implemented Task 7 only (AC 34–38).

## RED
- Added `deleteFile` invalidation behavior test to `test/graph-store.test.ts` covering:
  - removal of nodes in deleted file
  - removal of outgoing + incoming touching edges
  - retention of unrelated nodes/edges
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `Not implemented: deleteFile`

## GREEN
- Implemented `deleteFile` in `src/graph/sqlite.ts` as planned:
  - explicit transaction (`BEGIN/COMMIT/ROLLBACK`)
  - delete edges touching file-owned nodes (source or target)
  - delete nodes for the file
  - delete file hash row
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `11 pass, 0 fail`
  - `tsc --noEmit` passed
