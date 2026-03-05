# Implement Task 6 — SqliteGraphStore file query: getNodesByFile

## Scope
Implemented Task 6 only (AC 32–33).

## RED
- Added `getNodesByFile` behavior test to `test/graph-store.test.ts`:
  - returns all nodes for a matching file
  - returns `[]` for missing file
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `Not implemented: getNodesByFile`

## GREEN
- Implemented `getNodesByFile` in `src/graph/sqlite.ts` using planned SQL:
  - filter by `file`
  - stable ordering by `start_line ASC, id ASC`
  - map rows to `GraphNode[]`
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `10 pass, 0 fail`
  - `tsc --noEmit` passed
