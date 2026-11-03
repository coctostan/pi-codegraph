---
status: active
---
# The index says when it lost data

codegraph's answers carry a trust line, and `Trust: fresh` should mean nothing is missing. Today a question to the TypeScript server that times out or fails leaves a gap with no sign of it, and some bookkeeping rows hide in the symbol tables, where they outlive edits and skip work a fresh index would redo. This arc makes every gap show on the answer it touches, and moves the bookkeeping out of the tables.

## Destination
A result touched by a tsserver lookup that failed, at indexing or at query time, reads `Trust: partial` with a note saying so, until a later lookup answers. The git stage's head row and the lazy resolver's markers live in `graph_metadata`, no content-table filter knows them, and an incremental index re-resolves callers as a fresh one does.

## Done when
- [ ] On a fixture repo whose fake `ITsServerClient` times out the `definition` lookup for `a`'s call to `b`, `trace` `{"name":"a"}` and `symbol_graph` `{"name":"b"}` read `Trust: partial` with a `- lookups failed:` note counting it. After a re-index whose client answers, both read `Trust: fresh` and the call resolves. The same file's real-tsserver case, at a 1 ms `timeoutMs`, reads `partial` too — verified by `bun test test/indexer-lsp-lookup-failure.test.ts`
- [ ] On a fixture whose fake client times out `references`, `symbol_graph` reads `Trust: partial` with the same note, and the next call asks again. A timed-out `implementations` leaves its marker unset and the next call asks again. A `TsServer failed to start` still sets both markers — verified by `bun test test/tool-symbol-graph-lookup-failure.test.ts`
- [ ] After an index and a `symbol_graph` call, no `nodes`, `edges` or `file_hashes` row holds a `__meta__` or `__git_cochange_head__` key. A db holding them from before the arc drops them on open. `git grep -n -e __meta__ -e GIT_HEAD_KEY -- src` prints nothing. A root `__tests__/x.ts` counts as a file in the token tracker — verified by `bun test test/graph-store-metadata-sentinels.test.ts test/token-tracker-naive-files.test.ts` and that `git grep`
- [ ] On a fixture with a name-resolving fake client, where tree-sitter leaves a caller of `X` unresolved: a `symbol_graph` on `X`, an edit to the caller's file, a re-index and another `symbol_graph` on `X` list the same callers as a fresh index queried once. `clearFile` and `deleteFile` no longer delete coverage edges or test traces, and every existing parity case stays green — verified by `bun test test/indexer-incremental-parity.test.ts`
- [ ] On the real artifact: `bun run check && bun test` pass. `bun bench/index-parity.ts` on this repo at HEAD with real tsserver prints `6/6 edits pass` and exits 0. AGENTS.md's loader command, running `symbol_graph` `{"name":"indexProject"}` on this checkout, prints `Trust: fresh` and `path  LINE:HASH` anchors — verified by those commands

## Now
slice 1 (Leave coverage to the coverage stage) is active on branch `index-honesty/01-coverage-to-coverage-stage`. Next action: build it per its plan.

## Seams
- Store: `SqliteGraphStore` in `src/graph/sqlite.ts` behind `GraphStore` in `src/graph/store.ts` (`clearFile`, `deleteFile`, `listFiles`, `getStatistics`, `graph_metadata` access, failed-lookup records); tests in `test/graph-*.test.ts` on `:memory:` and temp dbs.
- Pipeline and LSP stage: `indexProject` in `src/indexer/pipeline.ts` and `runLspIndexStage` in `src/indexer/lsp.ts`, through a fake `ITsServerClient` (or the real `TsServerClient` with a small `timeoutMs`) passed as `lspClientFactory`; tests in `test/indexer-*.test.ts` on temp repos.
- Resolver: `resolveMissingCallers` and `resolveImplementations` in `src/indexer/lsp-resolver.ts`, driven through the `symbol_graph` tool in `src/index.ts`; tests in `test/tool-symbol-graph-*.test.ts`.
- Trust: `evaluateFreshness` and `formatFreshnessHeader` in `src/output/freshness.ts`, fed by `src/tools/{trace,symbol-graph,impact}.ts`; tests in `test/output-freshness-evaluator.test.ts`, `test/output-trust-header.test.ts` and the per-tool trust tests.
- Parity: `test/indexer-incremental-parity.test.ts` and `bench/index-parity.ts`.
- Real artifact: AGENTS.md's loader command on this checkout, and `bun bench/index-parity.ts` on a worktree of HEAD with real tsserver.

## Slices
1. **Leave coverage to the coverage stage** — delivers `clearFile` and `deleteFile` no longer deleting coverage edges or test traces, and the pipeline's dangling-edge pass skipping `coverage` edges, so a coverage edge into a removed declaration doesn't re-extract its test file. The coverage stage, run on every index, rebuilds them all · proof `bun test test/indexer-incremental-parity.test.ts` and the coverage-stage tests stay green, plus a red → green case for a test file left unextracted after its target declaration goes · blocked-by — · status active
   Goal: re-indexing a changed or removed file leaves `coverage` edges and test traces to `runCoverageIndexStage`, whose `clearCoverage` rewrites them every run, and the dangling-edge pass ignores `coverage` edges; part of done-when check 4.
   Assumptions: a `tested_by` edge runs from the covered production node to the test node (`writeCoverage`), so the file a dangling one would re-extract is the covered source file, not the test file the entry names (inferred from `src/indexer/coverage.ts`); node ids carry the start line, so a line shift in `src/lib.test.ts` changes the test node's id and leaves `helper`'s edge dangling once `clearFile` keeps it; no FK ties `test_trace_steps` to `nodes`; a readonly db fails `clearFile` and `deleteFile` before this change too.
   Reach: `SqliteGraphStore.clearFile` and `deleteFile` in `src/graph/sqlite.ts` drop their coverage-edge and `test_trace_steps` deletes; `clearFile`'s doc in `src/graph/store.ts`; the dangling query and its comment in `indexProject` (`src/indexer/pipeline.ts`) skip `provenance_source = 'coverage'`; a new case in `test/indexer-incremental-parity.test.ts`.
   Proof: the new case (a line shift in `src/lib.test.ts` leaves `src/lib.ts`'s `file_hashes.indexed_at` as it was) green on `main`, red with the store change alone, green with the pass's skip; `bun test test/indexer-incremental-parity.test.ts` and the coverage-stage tests (`test/indexer-coverage*.test.ts`); `bun run check && bun test`; `bun bench/index-parity.ts` 6/6; AGENTS.md's loader command prints `Trust: fresh`.
2. **Move the git head into graph_metadata** — delivers the git stage reading and writing its last head as a `graph_metadata` key, an existing `file_hashes` head row moving there on open, and `listFiles`' and `getStatistics`' key filters gone · proof `bun test test/indexer-git-incremental.test.ts test/graph-store-statistics-sentinel.test.ts` stay green, plus a red → green case in `test/graph-store-metadata-sentinels.test.ts` for the migrated row · blocked-by — · status next
3. **Move resolver markers into graph_metadata** — delivers `hasMarker`/`setMarker` keeping `callers` and `implementations` markers as `graph_metadata` keys, old `__meta__` marker nodes and edges deleted on open, and the 7 `__meta__` filters in `src/tools/symbol-card.ts`, `src/tools/symbol-graph.ts` and `src/indexer/pipeline.ts` gone. The token tracker's `__` prefix filter narrows to `__unresolved__`, so a root `__tests__/` file counts. Behavior is pinned first by the existing resolver and meta-filter tests · proof `bun test test/tool-symbol-graph-lsp.test.ts test/tool-symbol-card-meta-filter.test.ts test/token-tracker-naive-files.test.ts` green, `test/graph-store-metadata-sentinels.test.ts` red → green for the old rows, and the `git grep` from check 3 prints nothing · blocked-by 2 · status next
4. **Drop resolver markers when a file changes** — delivers an index run that re-extracts or removes any file clearing every resolver marker, so the next `symbol_graph` on a symbol asks tsserver again, as a fresh index would · proof a new case in `test/indexer-incremental-parity.test.ts`, red → green: a caller only `references` finds, lost after an edit to its file, comes back · blocked-by 3 · status next
5. **Mark results an index lookup failed** — delivers `runLspIndexStage` recording each `definition` lookup that times out or errors (startup failure aside) on its edge's source and evidence, clearing the record when a later run answers. `evaluateFreshness` reads the records for the result's rendered calls and for calls named after a target, turning `Trust: partial` with a `- lookups failed: N calls (tsserver timed out or errored)` note · proof `bun test test/indexer-lsp-lookup-failure.test.ts` red → green, its fake-client and real-tsserver cases from check 1 · blocked-by — · status next
6. **Mark results a query lookup failed** — delivers a timed-out or errored `references` or `implementations` in `symbol_graph`'s resolver turning that result `Trust: partial` with the same note, and `resolveImplementations` setting its marker only on an answer or a startup failure · proof `bun test test/tool-symbol-graph-lookup-failure.test.ts` red → green, then the real-artifact commands from check 5 · blocked-by 3, 5 · status next

## Not yet specified

## Out of scope
- Surfacing the other stages' index errors (file reads, ast-grep, git, coverage), which `IndexResult.errors` counts but nothing shows on a writable db.
- Signals counting unresolved calls (`[leaf]` above a `?` line).
- Tool-description tuning for pick rate, and `trace` from a `file:line`.
- Python support.

## Decisions
- Shape, 2026-11-03 (chat): a failed lookup shows per result, not as a global note. Resolver markers clear on any run that re-extracts or removes a file, not per dependency. The arc may bump `SCHEMA_VERSION`.
