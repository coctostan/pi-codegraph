# Task 005 Implementation Log

## Changes
- Replaced `test/indexer-extract-file.test.ts` with Task 5 test set (adds import-edge expectations).
- Updated `src/indexer/tree-sitter.ts` to add import-edge extraction:
  - helper `unresolvedId(name)`
  - helper `unquoteStringLiteral(text)`
  - per-file edge dedupe via `edgeKeys` + `pushEdge`
  - `import_statement` visitor for named/aliased/default imports

## TDD
- RED: `bun test test/indexer-extract-file.test.ts` failed with missing `fooEdge`.
- GREEN: targeted test passes after implementation.
- Regression: `bun test` passes.
