# Task 006 Implementation Log

## Changes
- Replaced `test/indexer-extract-file.test.ts` with Task 6 test set (adds calls-edge and parse-error behavior).
- Updated `src/indexer/tree-sitter.ts` `extractFile()` to:
  - short-circuit to empty nodes/edges when parse has errors
  - extract `calls` edges from bare call expressions (`foo()`) and constructors (`new MyClass()`)
  - ignore method calls (`obj.method()`, `this.method()`)
  - keep edge dedupe behavior

## TDD
- RED: `bun test test/indexer-extract-file.test.ts` failed on missing `fooCall`.
- GREEN: targeted test passes after implementation.
- Regression: `bun test` passes.

## Note
- Adjusted parse-error check to support Bun’s runtime shape where `rootNode.hasError` is a boolean property (not always a function).
