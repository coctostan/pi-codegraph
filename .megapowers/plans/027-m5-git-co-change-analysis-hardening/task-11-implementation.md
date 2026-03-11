# Task 11 — Wire git co-change stage into pipeline as Stage 5

## What changed

- Added new pipeline test: `test/indexer-pipeline-git-stage.test.ts`.
- Updated `src/indexer/pipeline.ts` to:
  - include `timings: Record<string, number>` in `IndexResult`,
  - measure timing for all 5 stages (`tree-sitter`, `lsp`, `ast-grep`, `coverage`, `git`),
  - run `runGitCoChangeStage(store, projectRoot)` as Stage 5,
  - preserve summary counts (`indexed`, `skipped`, `removed`, `errors`),
  - skip deleting sentinel keys (files starting with `__`) in stale-file cleanup.

## TDD evidence

### RED
Command:
`bun test test/indexer-pipeline-git-stage.test.ts`

Failure observed:
- `result.timings` was `undefined`.

### GREEN
Command:
`bun test test/indexer-pipeline-git-stage.test.ts`

Result:
- 1 pass, 0 fail

### Regression note
Running full suite after Task 11 surfaced expected downstream test-shape failures in `test/indexer-index-project.test.ts` (strict `toEqual` against old result shape). Those were addressed in Task 12.
