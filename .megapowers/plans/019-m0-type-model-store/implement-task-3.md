# Implement Task 3 — SqliteGraphStore bootstrap: constructor default, schema init, and schema_version

## Scope
Implemented Task 3 only (AC 22, 23, 43).

## RED
- Added runtime tests in `test/graph-store.test.ts` for:
  - default constructor path
  - schema bootstrap + `schema_version=1`
- Added compile-time assertion in `test/graph-types.typecheck.ts` that `SqliteGraphStore` is assignable to `GraphStore`.
- Ran:
  - `bun test test/graph-store.test.ts`
- Observed expected failure:
  - `SQLiteError: no such table: schema_version`

## GREEN
- Replaced `src/graph/sqlite.ts` with planned bootstrap implementation:
  - `constructor(dbPath = ":memory:")`
  - `initSchema()` creating `nodes`, `edges`, `file_hashes`, `schema_version`
  - index creation for nodes/edges
  - one-time insert of schema version row (`1`)
  - placeholder method stubs for remaining GraphStore APIs
- Re-ran:
  - `bun test test/graph-store.test.ts` (pass)

## Full verification
- Ran:
  - `bun test && bun run check`
- Result:
  - `7 pass, 0 fail`
  - `tsc --noEmit` passed
