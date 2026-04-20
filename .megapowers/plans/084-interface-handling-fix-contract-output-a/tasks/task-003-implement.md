# Task 3 implementation

Status: complete

## Changes
- Updated `test/tool-symbol-graph-lsp.test.ts` so the positive fixture includes the class signature `class Worker implements IWorker`.
- Updated `src/indexer/lsp-resolver.ts` so `resolveImplementations()` only persists `implements` edges when the class declaration actually names the target interface.
- The resolver now prefers the stored class `signature` and falls back to reading the class declaration from disk only when the signature is missing.

## TDD log
- RED: `bun test test/repro-084-interface-handling.test.ts test/tool-symbol-graph-lsp.test.ts -t 'repro #077|resolveImplementations persists implements edges and marker; second run skips implementations\(\)'`
  - Failed as expected with `Expected length: 0` and `Received length: 1` for the false `GraphStatistics` implements edge.
- GREEN: `bun test test/repro-084-interface-handling.test.ts test/tool-symbol-graph-lsp.test.ts -t 'repro #077|resolveImplementations persists implements edges and marker; second run skips implementations\(\)'`
  - Passed: `2 pass`, `0 fail`.
- Full suite: `bun test`
  - Passed: `375 pass`, `0 fail`.
