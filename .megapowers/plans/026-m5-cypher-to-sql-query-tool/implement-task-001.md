# Implement Task 001 — Add read-only SQL queryRows to GraphStore

## RED
- Added failing test: `test/graph-store-query-rows.test.ts`
- Ran: `bun test test/graph-store-query-rows.test.ts`
- Failure matched expectation: `TypeError: store.queryRows is not a function`
- Signaled: `megapowers_signal({ action: "tests_failed" })`

## GREEN
- Updated GraphStore contract to include `queryRows<T>(sql, params?)`
- Implemented `SqliteGraphStore.queryRows()` with:
  - read-only guard (`SELECT` only)
  - parameterized execution (`prepare(...).all(...params)`)
- Ran: `bun test test/graph-store-query-rows.test.ts` (pass)
- Signaled: `megapowers_signal({ action: "tests_passed" })`

## Regression Fix
- `test/typecheck.test.ts` failed because `GraphStore` mock in `test/graph-types.typecheck.ts` lacked new `queryRows` method.
- Added `queryRows: () => []` to `validStore` mock.

## Full Suite
- Ran: `bun test`
- Result: `137 pass, 0 fail`

## Files changed
- `test/graph-store-query-rows.test.ts` (new)
- `src/graph/store.ts`
- `src/graph/sqlite.ts`
- `test/graph-types.typecheck.ts`
