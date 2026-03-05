# Implement Task 2 — GraphStore contract: NeighborOptions, NeighborResult, and method signatures

## Scope
Implemented Task 2 only (AC 11–21).

## RED
- Updated `test/graph-types.typecheck.ts` with planned compile-time `GraphStore` contract assertions.
- Ran:
  - `bun run check`
- Observed expected failure:
  - `Unused '@ts-expect-error' directive.`

## GREEN
- Replaced `src/graph/store.ts` with planned contract:
  - `NeighborOptions`
  - `NeighborResult`
  - `GraphStore` with 9 required methods
- Ran:
  - `bun run check`
- Additional compile regression appeared because `SqliteGraphStore` no longer satisfied the stricter `GraphStore` interface.
- Added minimal method stubs to `src/graph/sqlite.ts` so it structurally implements the new contract (no behavior changes).
- Re-ran:
  - `bun run check` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `5 pass, 0 fail`
  - `tsc --noEmit` passed
