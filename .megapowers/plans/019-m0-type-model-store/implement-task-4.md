# Implement Task 4 — SqliteGraphStore nodes: addNode/getNode with upsert semantics

## Scope
Implemented Task 4 only (AC 24–26).

## RED
- Added node behavior test to `test/graph-store.test.ts`:
  - add/get round-trip
  - upsert overwrite behavior
  - unknown id returns `null`
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `Not implemented: addNode`

## GREEN
- Implemented `addNode` and `getNode` in `src/graph/sqlite.ts` using planned SQL:
  - `INSERT OR REPLACE` for upsert semantics
  - row mapping to `GraphNode`
  - `null` for missing node
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `8 pass, 0 fail`
  - `tsc --noEmit` passed
