# Task 6 — RC-A accounting: per-stage write errors bump IndexResult.errors

Implemented per-stage error accounting for guarded write failures.

## Changes
- `src/indexer/lsp.ts`
  - `runLspIndexStage` now returns `Promise<number>`
  - increments a local `errors` counter in both guarded write catch blocks
  - returns accumulated errors
- `src/indexer/git.ts`
  - `runGitCoChangeStage` now returns `Promise<number>`
  - increments `errors` for guarded delete/add/setFileHash failures
  - returns accumulated errors from all exit paths
- `src/indexer/ast-grep.ts`
  - `applyRoutesToMatches`, `applyRendersMatches`, and `applyRuleMatches` now return counts
  - `runAstGrepIndexStage` now returns `Promise<number>` and accumulates rule-level errors
- `src/indexer/pipeline.ts`
  - folds returned stage error counts into `IndexResult.errors`
- `test/pipeline-stage-error-accounting.test.ts`
  - added coverage for LSP-stage write failures being counted without aborting the pipeline

## TDD
- RED: `bun test test/pipeline-stage-error-accounting.test.ts`
  - failed with `Expected: >= 1 / Received: 0` on `result.errors`
- GREEN: `bun test test/pipeline-stage-error-accounting.test.ts`
  - passed
- Regression: `bun test`
  - passed (`373 pass, 0 fail`)
