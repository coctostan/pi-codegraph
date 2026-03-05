# Task 004 Implementation Log

## Changes
- Replaced `test/indexer-extract-file.test.ts` with Task 4 test set (adds class/interface extraction assertions).
- Updated `src/indexer/tree-sitter.ts` AST walk to add:
  - `class_declaration` -> `kind: "class"`
  - `interface_declaration` -> `kind: "interface"`

## TDD
- RED: `bun test test/indexer-extract-file.test.ts` failed with `MyClass` undefined.
- GREEN: targeted test passes after implementation.
- Regression: `bun test` passes.
