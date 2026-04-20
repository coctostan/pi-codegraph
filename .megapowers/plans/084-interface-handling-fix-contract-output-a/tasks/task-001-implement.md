# Task 1 implementation

Status: complete

## Changes
- Updated `test/repro-084-interface-handling.test.ts` so repro #076 covers both interface methods and interface fields.
- Updated `src/tools/symbol-contract.ts` to render interface contracts from the interface source span, splitting top-level interface members into `### Methods` and `### Fields`.

## TDD log
- RED: `bun test test/repro-084-interface-handling.test.ts -t 'repro #076'`
  - Failed as expected with `Expected to contain: "### Methods"`.
- GREEN: `bun test test/repro-084-interface-handling.test.ts -t 'repro #076'`
  - Passed.
- Full suite: `bun test`
  - `377 pass`, `1 fail`.
  - Remaining failure is `repro #077: resolveImplementations should not add an implements edge from a return-site match`, which matches pending Task 3 for this issue.
