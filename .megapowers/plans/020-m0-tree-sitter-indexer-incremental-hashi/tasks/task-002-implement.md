# Task 002 Implementation Log

## Changes
- Created `test/indexer-extract-file.test.ts` with a RED test for `extractFile()` shape.
- Replaced `src/indexer/tree-sitter.ts` with:
  - `ExtractionResult` type
  - `sha256Hex()` helper
  - `extractFile(file, content)` returning a module node + empty `nodes`/`edges`
  - back-compat export `treeSitterIndex = extractFile`

## TDD
- RED: `bun test test/indexer-extract-file.test.ts` failed with missing `extractFile` export.
- GREEN: same test passes after implementation.
- Regression: `bun test` passes.
