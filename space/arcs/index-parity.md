---
status: active
---
# An incremental index matches a fresh one

## Destination
An existing `.codegraph/graph.db` answers as a fresh index of the same tree would after a file edit, a file added or removed, a coverage report changed or an extractor change, so `Trust: fresh` is true; indexes damaged before the fix repair themselves once.

## Done when
- [ ] `bun bench/index-parity.ts` on this repo at HEAD, with real tsserver, passes a control (no edit) and each scripted edit (comment append, line shift, callee rename, file removal, file addition): the re-indexed graph equals a fresh index of the same tree on nodes, edges and `test_trace_steps`, `created_at` aside; it exits 0 — verified by that command
- [ ] On a fixture git repo with a name-resolving fake LSP, the same edits keep parity for an edge from every stage that writes one (`calls` from tree-sitter and lsp, `imports`, ast-grep's, `co_changes_with`, `tested_by`); a deleted root `__tests__/x.ts` leaves the index and `getStatistics`; a removed coverage report takes its `tested_by` edges and test traces with it — verified by `bun test test/indexer-incremental-parity.test.ts`
- [ ] `initSchema` re-extracts on one trigger, a `schema_version` below the current one, and adds a missing `partial`/`call_end_*` column without re-extracting; `extractFile`'s output on a fixture is pinned to `schema_version`, a change to it failing with a message that names the bump — verified by `bun test test/graph-schema-version.test.ts`
- [ ] An index written before this arc re-extracts once on its next open: AGENTS.md's loader command running `symbol_graph` `{"name":"formatRoleTags"}` on this checkout's existing `.codegraph/graph.db` lists 6 callers, `renderSymbolCardBody` among them, where it lists 2 at shape — verified by that command and `bun test test/graph-schema-version.test.ts`

## Now
slice 1 (Make the schema version the one re-extract trigger) is active on branch `index-parity/01-schema-version-trigger`. Next action: build it.

## Seams
- Store: `SqliteGraphStore` in `src/graph/sqlite.ts` behind `GraphStore` in `src/graph/store.ts` (`initSchema`, `deleteFile`, `listFiles`, `getStatistics`); tests in `test/graph-*.test.ts` on `:memory:` and temp dbs.
- Pipeline: `indexProject` in `src/indexer/pipeline.ts`, returning `IndexResult`; tests in `test/indexer-*.test.ts` on temp git repos with a fake `ITsServerClient`.
- Stages: `runLspIndexStage` (`src/indexer/lsp.ts`), `runAstGrepIndexStage` (`src/indexer/ast-grep.ts`), `runCoverageIndexStage` (`src/indexer/coverage.ts`), `runGitCoChangeStage` (`src/indexer/git.ts`), each through `indexProject` in the parity test.
- Extractor: `extractFile` in `src/indexer/tree-sitter.ts`, pinned in `test/graph-schema-version.test.ts`.
- Parity: `bench/index-parity.ts`, its graph diff exported for `test/bench-index-parity.test.ts` and `test/indexer-incremental-parity.test.ts`; it indexes through `bench/run.ts`'s `indexWorktree`.
- Real artifact: `bun bench/index-parity.ts` on a worktree of this repo with real tsserver, and AGENTS.md's loader command on this checkout's `.codegraph/graph.db`.

## Slices
1. **Make the schema version the one re-extract trigger** — delivers `initSchema` adding the `partial` and `call_end_*` columns plainly, a `SCHEMA_VERSION` constant below which an open re-extracts once, and `test/graph-schema-version.test.ts` pinning `extractFile`'s output on a fixture to it, its failure naming the bump · proof the existing migration tests (`test/graph-store.test.ts`, `test/graph-store-coverage-metadata-legacy-db.test.ts`, `test/indexer-call-end.test.ts`, `test/indexer-external-calls.test.ts`, `test/signature-schema.test.ts`) green before and after; the pin red on a perturbed fixture output, green on the real one · blocked-by — · status active
   - Goal: done-when check 3 green: `initSchema` re-extracts only on a `schema_version` below `SCHEMA_VERSION`, adds a missing `partial`/`call_end_*` column without re-extracting, and `test/graph-schema-version.test.ts` pins `extractFile`'s output to `SCHEMA_VERSION`, its failure naming the bump.
   - Assumptions: `SCHEMA_VERSION` stays 2 here; slice 6 (Re-extract every existing index once) bumps it. No real db lacks a column at version 2: version 2 landed in #88, after `partial` (#85) and `call_end_*` (#87), and the open that writes 2 adds both (measured, `git log -S`), so dropping the column trigger skips no re-extract. A db with no `schema_version` row reads as version 0. The two cases that drop a column from a version-2 db and expect a re-extract (`test/indexer-call-end.test.ts`, `test/indexer-partial-parse.test.ts`) contradict done-when check 3; they get the version 1 a real pre-column db carries, keeping their intent under the one trigger.
   - Reach: `SCHEMA_VERSION` and `initSchema` in `src/graph/sqlite.ts`; new `test/graph-schema-version.test.ts` and its pin `test/fixtures/schema-version/extract-pin.json`; the column cases in `test/indexer-call-end.test.ts` and `test/indexer-partial-parse.test.ts`.
   - Proof: the five listed tests and `test/indexer-partial-parse.test.ts` green before and after; `bun test test/graph-schema-version.test.ts` green, red with a perturbed extractor; AGENTS.md's Prove checks; the loader command on this checkout's `.codegraph/graph.db`.
2. **Diff an incremental index against a fresh one** — delivers `bench/index-parity.ts`: on a worktree of HEAD with deps installed, per scripted edit and a control, index, apply the edit, re-index, index a fresh copy of the same tree, diff nodes, edges and `test_trace_steps` with `created_at` aside, print PASS or FAIL per edit with the first differing rows, exit 0 only when all pass · proof `bun test test/bench-index-parity.test.ts` red → green on a fixture repo; the real run's baseline: control PASS, comment append FAIL naming lost `calls` edges · blocked-by — · status next
3. **Keep edges into an edited file** — delivers re-indexing a changed file by deleting its nodes and the edges its own extraction wrote, keeping inbound edges whose target node survives and git and coverage edges while both ends exist, and re-extracting in the same run each unchanged file with an edge whose target vanished; starts with `diagnose` on the baseline · proof `bun test test/indexer-incremental-parity.test.ts` red → green for comment append, line shift and callee rename; `bun bench/index-parity.ts` control, comment append, line shift and callee rename PASS · blocked-by 2 · status next
4. **Unresolve edges into a removed file** — delivers the removal loop sending the sources of a removed file's inbound edges to re-extraction, so their calls read unresolved as on a fresh index; an added file's symbols resolving calls left unresolved; sentinel rows told apart from files by their keys, not a `__` prefix, so a deleted root `__tests__/x.ts` leaves the index and `getStatistics` · proof `bun test test/indexer-incremental-parity.test.ts` red → green for removal, addition and `__tests__/`; `bun bench/index-parity.ts` exits 0 · blocked-by 3 · status next
5. **Drop coverage edges no report backs** — delivers `runCoverageIndexStage` replacing its own `tested_by` edges and test traces each run, so a removed or changed report leaves no stale ones · proof `bun test test/indexer-incremental-parity.test.ts` red → green for a removed report · blocked-by 3 · status next
6. **Re-extract every existing index once** — delivers `SCHEMA_VERSION` bumped, so an index written before this arc re-extracts on its next open · proof a `test/graph-schema-version.test.ts` case opening a previous-version db red → green; AGENTS.md's loader command on this checkout's `.codegraph/graph.db` lists `formatRoleTags`'s 6 callers · blocked-by 1, 4, 5 · status next

## Not yet specified
- Whether tsserver answers the same twice, so two fresh indexes of one tree match: slice 2 (Diff an incremental index against a fresh one)'s control measures it; a mismatch there reshapes the first done-when check.
- Whether ast-grep writes an edge from one file into another; if it does, slice 3 (Keep edges into an edited file) keeps it as it keeps `calls`.

## Out of scope
- Tool description and pick-rate tuning, `trace` from a `file:line`, the `[leaf]` signals fix and the per-model verdict rule: routed in NOW.md.

## Decisions
