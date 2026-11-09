---
status: active
---
# Agents trace through classes

codegraph answers "what runs here" and "who calls this" for coding agents, but it never looks inside a class: a method can't be found by name, and asking what one does returns an empty answer that looks complete. This arc teaches codegraph to see class methods. It then nudges agents, Opus above all, to ask `trace` from the exact line they care about instead of reading whole files first. A paid benchmark run checks that both changes paid off.

## Destination
Class members are symbols that `symbol_graph`, `trace` and `impact` all answer about. `trace` stops calling a node a leaf when its calls are only unresolved, and its description and output steer agents to start from `file` + `line`. One 72-cell run in `bench/results/rerun-3/` measures Opus's pick of `trace`, and decision 0005 records the verdict.

## Done when
- [ ] Class members are symbols: probes on pi-codegraph at `cb5f75f8` show `symbol_graph` resolving a method by its bare name and by `Class.method`, `trace` by `file` + `line` inside a method listing its calls, and `impact` on a method listing a caller that calls it as `obj.m()`; every other probe still passes — verified by `bun bench/probe.ts class-` and `bun bench/probe.ts`, with `bun run check && bun test` · at shape, 2026-11-09: no `class-` probe; at this repo's head `symbol_graph {name:"addEdge", file:"src/graph/sqlite.ts"}` reads `Symbol "addEdge" not found`, and `trace {file:"src/graph/sqlite.ts", line:208}` prints `addEdge` with no calls under `Trust: fresh`
- [ ] In `trace`, a node whose calls are all unresolved no longer reads `[leaf]`, and a test case's own line in coverage mode no longer reads `[leaf, untested]` — verified by `bun test test/output-signals.test.ts test/tool-trace-signals.test.ts test/tool-trace-coverage.test.ts`
- [ ] `bun bench/verdict.ts` refuses to run without `--results` and no longer takes `--on-results`; `bench/run.ts` and `bench/probe.ts` take `--repos`, defaulting to this checkout's parent directory, and their two shortcut lines are gone; each per-pair row prints `lines n/m`, the on cells whose `trace` call passed `line` — verified by `bun test test/bench-verdict.test.ts test/bench-run.test.ts test/bench-probe.test.ts` and by `bun bench/verdict.ts --results bench/results/rerun-2` printing `lines 0/3` on Opus's two trace rows and `lines 3/3` on GPT's
- [ ] `bench/results/rerun-3/` holds 72 cells (decision 0002's 6 tasks × 2 arms × `anthropic-cc/claude-opus-5-5` and `openai-codex/gpt-6.1-sol` × 3 repeats), all on pi 1.5.0, one `codegraphCommit` holding slices 1–7 and one `providerCommit`, at a summed `costUsd` of $15 or less; `bun bench/verdict.ts --results bench/results/rerun-3` exits 0 and prints `keep` — verified by that command and a sum of the cells' `costUsd`
- [ ] In that run, how many of Opus's 6 on-arm trace cells (tool-call-path, cc-payload-trace) call a codegraph tool, and how many pass `line`, is measured and recorded against targets of at least 5 and at least 3; a miss is a finding decision 0005 records and `NOW.md` routes, not a stop — verified by those two tasks' Opus rows, `picks` and `lines`, and a read of decision 0005 · at shape, 2026-11-09: 3 of 6 picks and 0 of 6 with `line` in `rerun-2` (decision 0004; `line` counted from its transcripts)
- [ ] `space/decisions/0005-*.md` records the run's verdict command output verbatim, the Opus pick and `line` counts against their targets, and the spend; on `freeze` or `retire` it supersedes decision 0002 — verified by a read against `bun bench/verdict.ts --results bench/results/rerun-3`'s output

## Now
Slice 1 (Index class members as symbols), no branch yet. Next action: plan it with `slice` in a fresh session.

## Seams
- Extraction: `extract`, `extractFile` and `extractFunctionAt` in `src/indexer/tree-sitter.ts`; tests in `test/indexer-extract-file.test.ts` and a new `test/indexer-class-members.test.ts` on inline sources.
- LSP stage: `runLspIndexStage` in `src/indexer/lsp.ts` against a fake `ITsServerClient`; tests in `test/indexer-lsp.test.ts`.
- Lookup: `resolveUniqueSymbol` in `src/tools/symbol-resolution.ts`; tests beside `test/tool-trace-ambiguous.test.ts` and `test/tool-impact-ambiguous.test.ts`, through the registered tools.
- Signals: `createSignalComputer` and `formatRoleTags` in `src/output/signals.ts`; tests in `test/output-signals.test.ts`, `test/tool-trace-signals.test.ts` and `test/tool-trace-coverage.test.ts`.
- Trace surface: `traceResult` in `src/tools/trace.ts` and `trace`'s `registerReadOnlyTool` call in `src/index.ts`; tests in `test/tool-trace-line.test.ts`, `test/extension-tool-descriptions.test.ts` and `test/tool-descriptions-style-guard.test.ts`.
- Probes: `bench/probes.json`, run by `bun bench/probe.ts` through each tool's registered `execute()` on the bench repos at their pinned commits: the real artifact for every graph change.
- Bench: `main` in `bench/run.ts`, `bench/probe.ts` and `bench/verdict.ts`, with `parseTranscript` and `decide`; tests in `test/bench-run.test.ts`, `test/bench-probe.test.ts` and `test/bench-verdict.test.ts`; cells under `bench/results/rerun-3/`: the real artifact for the descriptions.

## Slices
1. **Index class members as symbols**: delivers a node for each method, static method, getter, setter, arrow-function field and constructor, named `Class.member`, with its own calls filed under it, and a `this.m()` call to a member its own class declares resolved at index time; `trace` by `entry: "Class.member"` and by `file` + `line` inside a member shows those calls · proof `bun test test/indexer-class-members.test.ts test/tool-trace-line.test.ts`; probes `class-trace-entry` and `class-trace-line` pass (check 1) · blocked-by — · status next
2. **Find a method by its bare name**: delivers `resolveUniqueSymbol` matching `m` to `Class.m`, with several such matches returned as `isError` with their candidates, as any ambiguous name is now · proof a lookup test through `symbol_graph`, `trace` and `impact`; probe `class-graph-bare` passes (check 1) · blocked-by 1 · status next
3. **Resolve member calls through tsserver**: delivers `obj.m()`, inherited `this.m()` and `new X()` call sites resolved by the LSP stage to method and constructor nodes, so `impact` on a method reaches its callers · proof `bun test test/indexer-lsp.test.ts`; probe `class-impact` passes and `bun bench/probe.ts` passes every probe (check 1) · blocked-by 1 · status next
4. **Stop calling unresolved calls a leaf**: delivers signals that count unresolved calls, so a node with only `?` children isn't `[leaf]`, and a coverage-mode test case's own line isn't `[leaf, untested]` · proof `bun test test/output-signals.test.ts test/tool-trace-signals.test.ts test/tool-trace-coverage.test.ts` (check 2) · blocked-by — · status next
5. **Take bench paths as flags**: delivers `--repos` in `bench/run.ts` and `bench/probe.ts`, defaulting to the checkout's parent, the two shortcut lines dropped; `--results` required and `--on-results` cut from `bench/verdict.ts`. Prefactor: the bench tests pin the current behavior first · proof `bun test test/bench-run.test.ts test/bench-probe.test.ts test/bench-verdict.test.ts`; `bun bench/verdict.ts --results bench/results/rerun-2` still ends `wins 10/12` and `keep` (check 3) · blocked-by — · status next
6. **Count line-started traces per pair**: delivers `lines n/m` on each per-pair row, the on cells whose `trace` call passed `line`, read from each cell's transcript when the cell itself lacks the count · proof `bun test test/bench-verdict.test.ts test/bench-run.test.ts`; `bun bench/verdict.ts --results bench/results/rerun-2` prints `lines 0/3` on Opus's trace rows and `lines 3/3` on GPT's (check 3) · blocked-by 5 · status next
7. **Steer agents to trace by line**: delivers `trace`'s description, snippet and guidelines, and its output where the plan finds a lever, such as a hint naming the `file` + `line` to start from when an `entry` trace's root is reached from an anonymous callback, its wording set against decision 0004's Opus transcripts · proof the trace, description and style-guard tests pass; AGENTS.md's loader command prints the new definition; measured in slice 8 (Run both arms on the new code) (check 5) · blocked-by 1 · status next
8. **Run both arms on the new code**: delivers 72 cells under `bench/results/rerun-3/` from the default branch's head after slices 1–7, on pi 1.5.0 and one pi-claude-header commit pinned at plan time, loaded from detached worktrees placed by `--repos`; the plan opens with one Opus cell proving the provider is accepted; about $8, capped at $15 · proof `bun bench/verdict.ts --results bench/results/rerun-3` exits 0; the summed `costUsd` is $15 or less (checks 4, 5) · blocked-by 2, 3, 4, 6, 7 · status next
9. **Record the verdict in decision 0005**: delivers `space/decisions/0005-*.md` with the verdict output, Opus's pick and `line` counts against their targets and the spend, superseding decision 0002 on `freeze` or `retire`, and `NOW.md` routing what it finds · proof a read of the decision against `bun bench/verdict.ts --results bench/results/rerun-3`'s output (check 6) · blocked-by 8 · status next

## Not yet specified
- Which `obj.m()` calls become edges. tree-sitter can't tell a project method from a library one (`this.db.prepare`, `xs.map`). Shape's assumption: such a call is kept only when tsserver resolves it to a project node, and is otherwise dropped rather than shown as a `?` line. A `this.m()` call the class can't resolve stays a `?` line. Slice 3 (Resolve member calls through tsserver)'s plan confirms or revises this.
- How `trace` renders `new X()`: as `X.constructor`'s calls, or as the class node with the constructor beneath it. Slice 1 (Index class members as symbols)'s plan settles it.

## Out of scope
- Python support, custom TUI renderers.
- The "refresh index" recommendation for unreadable files in `src/output/freshness.ts`, and one-path (The index has one honest path)'s renames: they stay in `NOW.md` Next.
- tree-sitter-typescript's partial parses of pi-hashline-readmap, test callers counting toward fan-in, telling apart two anonymous functions on one line.
- Changing the correctness test, `minCut` or `keepWinFraction`; a second run to tell this arc's changes apart.
- A new tool (decision 0001).

## Decisions
- Shape 2026-11-09, owner (chat): the adoption targets are at least 5 of 6 Opus trace cells calling codegraph and at least 3 of 6 passing `line`, measured and recorded, a miss routed as a finding rather than stopping close (the owner chose this over a hard stop, after `NOW.md`'s note on two earlier missed model-behavior targets); the run covers all 6 tasks, at most $15; both models, 3 repeats, pi 1.5.0, one pinned provider commit; the class-member set and `Class.member` naming above; `trace`'s output may change along with its description.
- [0001](../decisions/0001-three-tool-public-surface.md): class members extend the existing tools; no new tool.
- [0004](../decisions/0004-right-tool-rerun.md): the baseline for check 5, 3 of 6 picks and no `line`.
