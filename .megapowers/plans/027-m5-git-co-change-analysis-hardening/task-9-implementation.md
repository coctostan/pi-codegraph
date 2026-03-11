# Task 9 — Git co-change incremental skip when HEAD unchanged

## What changed

- Added a new regression test file: `test/indexer-git-incremental.test.ts`.
- Implemented incremental HEAD-based skipping in `src/indexer/git.ts`.

## Implementation details

- Added sentinel key: `__git_cochange_head__`.
- Added `getCurrentHead(projectRoot)` helper using `git rev-parse HEAD`.
- `runGitCoChangeStage` now:
  - returns early if no git HEAD is available,
  - skips re-analysis when stored HEAD equals current HEAD,
  - clears prior `co_changes_with` edges from `git` provenance before rebuild when HEAD changes,
  - stores current HEAD at end (and when commits are empty).

## TDD evidence

### RED
Command:
`bun test test/indexer-git-incremental.test.ts`

Failure observed:
- `runGitCoChangeStage skips re-analysis when HEAD has not changed`
- Expected `edges2.length` to be `0`, received `1`.

### GREEN
Command:
`bun test test/indexer-git-incremental.test.ts`

Result:
- 2 pass, 0 fail

### Regression suite
Command:
`bun test`

Result:
- 188 pass, 0 fail
