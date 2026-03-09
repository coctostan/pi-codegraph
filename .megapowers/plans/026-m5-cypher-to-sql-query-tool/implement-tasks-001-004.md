# Implement Progress — Tasks 001-004

Completed in this session using strict RED → GREEN workflow.

## Task 001 — Add read-only SQL queryRows to GraphStore
- Added `test/graph-store-query-rows.test.ts` (RED -> GREEN)
- Added `queryRows<T>(sql, params?)` to `GraphStore`
- Implemented `SqliteGraphStore.queryRows()` with SELECT-only guard and parameterized execution
- Regression fix: updated `test/graph-types.typecheck.ts` mock store to include `queryRows`

## Task 002 — Parse supported Cypher subset into AST
- Added `test/graph-query-parser.test.ts` (RED -> GREEN)
- Created `src/tools/graph-query-parser.ts`
  - Added AST types
  - Added parser for MATCH / WHERE / RETURN / LIMIT
  - Added traversal and node-only parsing

## Task 003 — Reject multiple MATCH clauses
- Added `test/graph-query-parser-match-clause.test.ts` (RED -> GREEN)
- Updated `splitClauses()` in parser to enforce exactly one `MATCH`

## Task 004 — Compile parsed graph queries to parameterized SQL
- Added `test/graph-query-compiler.test.ts` (RED -> GREEN)
- Created `src/tools/graph-query-compiler.ts`
  - Deterministic SQL generation
  - Bound parameter list generation
  - Column metadata for node/edge/scalar outputs

## Verification
- Final full-suite run: `bun test`
- Result: `140 pass, 0 fail`
