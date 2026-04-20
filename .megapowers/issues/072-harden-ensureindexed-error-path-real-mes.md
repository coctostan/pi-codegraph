---
id: 72
type: bugfix
status: done
created: 2026-04-20T00:12:02.456Z
sources: [68, 69, 70, 71]
---
# Harden ensureIndexed error path: real messages, guarded writes, unsticky cache, race-free
## Context

During investigation of a spurious `indexing-failed: graph may be stale (readonly database)` note appearing on every tool output this session, four tightly-coupled defects were identified in the `ensureIndexed` / `indexProject` error path. They compound each other — fixing any one in isolation would leave the others continuing to produce similar confusing behavior.

## Evidence the defects are real

- `ls -le .codegraph/graph.db` → `-rw-r--r--`, owner matches, only `com.apple.provenance` xattr
- `accessSync(path, W_OK)` on file and directory → both succeed
- `sqlite3 PRAGMA integrity_check` → `ok`
- Manual `indexProject` → `indexed: 175, errors: 0`
- `bun test` → 366 pass / 0 fail
- Yet: every tool output in the initial agent turn carried the readonly-database note

The note was not about permissions at all.

## Why batch the four

| # | Issue | Role |
|---|-------|------|
| 69 | Unguarded `store.addEdge`/`deleteEdge` in `runLspIndexStage` (plus same pattern in git + ast-grep stages) | **Produces** the transient error |
| 71 | No mutex on `ensureIndexed` — parallel tool calls race on shared store | **Triggers** the transient error |
| 70 | `lastIndexError` is sticky with no TTL or clear-on-success | **Propagates** the error past its actual lifetime |
| 68 | `indexingFailedNote` hardcodes "readonly database" | **Hides** the real cause |

Fixing them together yields: real errors are surfaced, transient write conflicts don't escalate to session-poisoning, parallel tool calls don't re-trigger the conflict, and the cached error clears when the system heals.

## Suggested implementation order

1. **#68 first** — trivial, single-line. Immediately improves debuggability so subsequent work has honest feedback.
2. **#69** — audit and guard per-edge writes in `src/indexer/lsp.ts`, `src/indexer/git.ts`, `src/indexer/ast-grep.ts`. Add a shared helper `tryStoreWrite(fn)` to avoid copy-paste.
3. **#71** — add the in-flight promise mutex in `ensureIndexed`.
4. **#70** — add `{ error, setAt }` shape + clear-on-successful-read. Easiest to validate once the race and the noise are gone.

## Non-goals

- Do not change the SQLite `journal_mode` or `busy_timeout` as part of this batch. That's a separate performance/concurrency question and the above fixes should make it unnecessary.
- Do not migrate storage backends.

## Tests

Each source issue has its own test plan. Taken together: a single new test file `test/extension-indexing-robustness.test.ts` can cover the integration behavior (parallel tool calls on empty DB + forced transient write failure → clean output + no session poisoning).

## Risk

Low to medium. All changes are localized to `src/index.ts` and the three indexer stages. No schema changes. No tool-API changes. Existing test suite (366 tests) must continue to pass.
