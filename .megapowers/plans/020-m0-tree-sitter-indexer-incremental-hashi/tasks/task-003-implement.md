# Task 003 Implementation Log

## Changes
- Replaced `test/indexer-extract-file.test.ts` with the Task 3 RED test set.
- Updated `src/indexer/tree-sitter.ts` to parse TypeScript via tree-sitter and extract:
  - exported function declarations
  - arrow-function variable assignments
- Added helpers from plan (`typescriptLanguage`, `addNode`, AST `walk`) and kept `treeSitterIndex` back-compat export.

## TDD
- RED: `bun test test/indexer-extract-file.test.ts` failed on missing extracted `foo`.
- GREEN: test passes after implementation.
- Regression: `bun test` passes.

## Note
- Runtime required ensuring Bun can load tree-sitter native binding (`prebuilds/darwin-arm64/tree-sitter.node`) in this local environment.
