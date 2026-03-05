# Implement Task 5 — SqliteGraphStore edges: addEdge/getNeighbors with direction and kind filters

## Scope
Implemented Task 5 only (AC 27–31).

## RED
- Added edge/neighbor behavior test to `test/graph-store.test.ts` covering:
  - out/in/both direction behavior
  - edge kind filters
  - empty filtered result
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `Not implemented: addEdge`

## GREEN
- Implemented `addEdge` and `getNeighbors` in `src/graph/sqlite.ts` using planned SQL and row mapping:
  - `INSERT OR REPLACE` into `edges`
  - directional joins for outbound and inbound neighbors
  - optional edge-kind filtering
  - mapped `NeighborResult[]` with `node` + `edge` payloads
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `9 pass, 0 fail`
  - `tsc --noEmit` passed
