# Task 10 — Git co-change graceful handling of non-git directories

## What changed

- Added test file: `test/indexer-git-no-repo.test.ts` with 3 tests:
  1. non-git directory does not throw and creates no co-change edges,
  2. empty git repo (no commits) does not throw and creates no co-change edges,
  3. git CLI stderr noise is suppressed in those scenarios.
- Updated `src/indexer/git.ts` to suppress git stderr noise:
  - `getCurrentHead()` now runs `git rev-parse HEAD` with `stdio: ["ignore", "pipe", "ignore"]`.
  - `parseGitLog()` now runs `git log ...` with `stdio: ["ignore", "pipe", "ignore"]`.

## TDD evidence

### RED
Command:
`bun test test/indexer-git-no-repo.test.ts`

Failure observed:
- `runGitCoChangeStage suppresses git CLI noise for non-git and empty repos`
- Expected empty `stderr`, got git fatal messages.

### GREEN
Command:
`bun test test/indexer-git-no-repo.test.ts`

Result:
- 3 pass, 0 fail

### Regression suite
Command:
`bun test`

Result:
- 191 pass, 0 fail
