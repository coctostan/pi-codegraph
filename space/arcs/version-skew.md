---
status: active
---
# Indexes stay honest across versions

codegraph keeps one index file per project, and every pi session open on that project shares it. A session started before a codegraph update keeps running the old code, and when files change it rewrites the index the old way. The new code then answers from those rows and calls them fresh. On 2026-11-10 that left this repo's own index missing every class method while it reported `Trust: fresh`. This arc makes each side of a version gap either repair the index or say it can't be trusted.

## Destination
Each indexed file records which extractor version wrote it, and newer code re-extracts any file an older extractor wrote, including rows from code that predates this arc. Code meeting an index newer than itself leaves the file untouched and answers `Trust: stale`, telling the agent to restart pi.

## Done when
- [ ] After code from before class members (`90b1cc72^`) re-indexes one edited file in a worktree of HEAD, current code's `symbol_graph {"name":"SqliteGraphStore.addEdge"}` resolves under `Trust: fresh`, and the index holds as many `Class.member` nodes as a fresh index of the same tree — verified by `bun bench/version-skew.ts`, case `older-writer` · at shape, 2026-11-10, replayed by hand with pi's real loader: `Symbol "SqliteGraphStore.addEdge" not found` under `Trust: fresh`, members 54 → 0 after the old run; this checkout's own `.codegraph/graph.db` read the same, 0 of 54 members and 5641 of 8399 edges against a fresh index
- [ ] A `file_hashes` row stamped below `SCHEMA_VERSION`, or written by an `INSERT` that names no stamp as code before this arc writes it, is re-extracted by the next index run though its content hash matches; in the same run, a row stamped at `SCHEMA_VERSION` keeps its nodes and edges — verified by `bun test test/graph-schema-version.test.ts test/indexer-incremental-parity.test.ts` · at shape, 2026-11-10: `setFileHash` writes `INSERT OR REPLACE INTO file_hashes (file, hash, indexed_at, partial)` (`src/graph/sqlite.ts:376`), so a new column's default reaches a pre-arc writer's rows; `indexProject` skips a file whose hash matches (`src/indexer/pipeline.ts:157`)
- [ ] When `.codegraph/graph.db`'s `schema_version` is above the running code's `SCHEMA_VERSION`, each of `symbol_graph`, `impact` and `trace` answers `Trust: stale` with a line naming both versions and a recommendation to restart pi, and the file's bytes are unchanged after a tool call over an edited tree — verified by `bun test test/tool-newer-index.test.ts` and `bun bench/version-skew.ts`, case `newer-index` · at shape, 2026-11-10, a worktree of HEAD with `schema_version` set to 6 and `src/graph/store.ts` edited: `symbol_graph {"name":"openDb"}` answered `Trust: fresh` and the db's sha256 went `b9cf378d…` → `30cbedac…`
- [ ] `bun run check && bun test` passes, `test/pi-host-load.test.ts` included under Bun and Node — verified by that command

## Now
Slice 1 (Replay a version skew on worktrees) is next: plan it in a fresh session with `slice`.

## Seams
- Store: `SqliteGraphStore` in `src/graph/sqlite.ts` (`initSchema`, `setFileHash`, the stamp's read) behind `GraphStore` in `src/graph/store.ts`; tests in `test/graph-schema-version.test.ts` on temp dbs, a pre-arc writer seeded as a literal `INSERT`.
- Pipeline: `indexProject` in `src/indexer/pipeline.ts`; tests in `test/indexer-incremental-parity.test.ts` on temp git repos.
- Store opening: `openProjectStore` in `src/index.ts`, reached through each registered tool's `execute()`; tests in a new `test/tool-newer-index.test.ts`.
- Trust: `evaluateFreshness` and `formatFreshnessHeader` in `src/output/freshness.ts`; tests in `test/tool-newer-index.test.ts` through the tools, beside `test/output-freshness-evaluator.test.ts`.
- Real artifact: `bun bench/version-skew.ts`, driving worktrees of this repo through pi's real loader as AGENTS.md's Prove does, `90b1cc72^` its older writer; its verdict function tested in `test/bench-version-skew.test.ts`.

## Slices
1. **Replay a version skew on worktrees** — delivers `bench/version-skew.ts` with two cases, printing PASS or FAIL for each and exiting 0 only when both pass: `older-writer` (current code indexes a worktree of HEAD, one file is edited, `90b1cc72^`'s code re-indexes it, then current code answers `symbol_graph {"name":"SqliteGraphStore.addEdge"}` and the `Class.member` count is compared with a fresh index of the same tree) and `newer-index` (a worktree's `schema_version` set one above `SCHEMA_VERSION`, a file edited, one tool call, then the db's sha256 and the `Trust:` line) · proof `bun test test/bench-version-skew.test.ts` red → green on its verdict function; a real run prints FAIL on both cases with the shape's before-states · blocked-by — · status next
2. **Stamp each indexed file with its extractor version** — delivers a `file_hashes` stamp column defaulting below every version, `setFileHash` writing `SCHEMA_VERSION`, and `indexProject` re-extracting a file stamped below it though its hash matches; the bump's hash blanking in `initSchema` goes if the stamp covers it, the git head reset kept · proof `bun test test/graph-schema-version.test.ts test/indexer-incremental-parity.test.ts` red → green; `bun bench/version-skew.ts` PASS on `older-writer` · blocked-by 1 · status next
3. **Leave a newer index untouched** — delivers `openProjectStore` opening a `graph.db` whose `schema_version` is above `SCHEMA_VERSION` on a temp copy, as it opens a read-only one, so the shared file keeps its bytes · proof `bun test test/tool-newer-index.test.ts` red → green on the file's sha256 after a tool call over an edited tree · blocked-by — · status next
4. **Read a newer index as stale** — delivers every result over a newer index reading `Trust: stale`, with a line naming the index's and the code's versions and a recommendation to restart pi · proof `bun test test/tool-newer-index.test.ts` red → green through all three tools; `bun bench/version-skew.ts` exits 0 · blocked-by 2, 3 · status next

## Not yet specified
- Whether `/codegraph status` names a version gap too.
- How often a pre-arc session and a current one, both open on one project, re-extract each other's files (inferred: once per file the old session rewrites, unmeasured).

## Out of scope
- Resolving calls by call site and linking interface-typed receivers to their implementations: the next arc, shaped after this one, with the `isUnresolved` cut from `NOW.md` as its first slice.
- The other cuts and output fixes `NOW.md` routes.
- Stopping long-running pi sessions on old code: the owner's call, not codegraph's.
- Two processes at the same version writing one index at once.

## Decisions
