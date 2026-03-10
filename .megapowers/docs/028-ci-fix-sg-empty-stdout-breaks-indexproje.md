# Bugfix Summary — 028: CI: `sg` empty stdout breaks `indexProject`

## Root Cause

`runScan()` in `src/indexer/ast-grep.ts` had an inconsistent subprocess contract assumption.

`defaultExec()` already knew that `sg run --json` exits with code `1` on no-match (like `grep`) and treated that as success. But `runScan()` then called `JSON.parse(stdout)` unconditionally — not accounting for the case where "no matches" also means empty stdout (`""`) instead of `[]`.

In CI (and in some builds of ast-grep), a no-match `sg` invocation returns **exit code `1` and empty stdout**, not `exit code 1` and `"[]"`. The unconditional parse then threw:

```
error: Invalid sg JSON output: JSON Parse error: Unexpected EOF
      at runScan (src/indexer/ast-grep.ts:156:15)
      at async runAstGrepIndexStage (src/indexer/ast-grep.ts:271:27)
      at async indexProject (src/indexer/pipeline.ts:105:9)
```

Because `indexProject()` is the shared pipeline entrypoint and `ensureIndexed()` makes all five extension tools (`symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`) depend on it, every tool call on an empty store would fail.

## Fix

One-line normalization at the subprocess boundary in `runScan()`:

```ts
// sg outputs empty string (not "[]") when no matches found — treat as empty result
if (!stdout.trim()) return [];
```

Added at `src/indexer/ast-grep.ts:151-152` (commit `6fc342b6`). The rest of the parse/error path is unchanged — genuinely malformed non-empty JSON still throws `Invalid sg JSON output`.

## Files Changed

| File | Change |
|------|--------|
| `src/indexer/ast-grep.ts` | Empty-stdout guard in `runScan()` (the production fix, already committed) |
| `test/indexer-ast-grep-scan.test.ts` | 3 new regression tests: empty stdout → `[]`, whitespace → `[]`, malformed non-empty → throws |
| `test/indexer-index-project.test.ts` | 1 new integration regression test: `indexProject` completes when `Bun.spawn` returns `sg` with exit `1` + empty stdout |

## Verification

```
bun test test/indexer-ast-grep-scan.test.ts test/indexer-index-project.test.ts
13 pass, 0 fail

bun test
168 pass, 0 fail
```

### Acceptance criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `runScan()` returns `[]` for empty or whitespace-only stdout | ✅ pass |
| 2 | `runScan()` still throws for malformed non-empty JSON | ✅ pass |
| 3 | `indexProject()` succeeds when Stage 3 gets empty-stdout from `sg` | ✅ pass |
| 4 | Regression tests exist at both subprocess boundary and integration level | ✅ pass |

## How to Reproduce the Original Bug

Install ast-grep in an environment where no-match returns exit `1` + empty stdout (or stub `Bun.spawn` to simulate it), then check out pre-fix commit `296616c1` and run `bun test test/indexer-index-project.test.ts`. The test fails with `JSON Parse error: Unexpected EOF`. On current HEAD the same test passes.
