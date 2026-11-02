---
status: active
---
# Whether codegraph earns its keep

## Destination
A measured verdict, keep, freeze or retire, on whether codegraph's three tools pay their way for Opus 5.5 and GPT-6.1 Sol on real TS repos, recorded as a decision, with the cheap cleanups landed and CI hardened only on keep.

## Done when
- [ ] `bench/tasks/` holds 6 read-only questions across pi-codegraph, pi-hashline-readmap and pi-claude-header at pinned commits, each with a hand-checked answer key, and `bench/thresholds.json` holds the keep/freeze/retire rule, both added in a commit before any file under `bench/results/` — verified by `git log --reverse --diff-filter=A --format='%h' --name-only -- bench/tasks bench/thresholds.json bench/results`
- [ ] `bench/results/` holds 72 graded cells, 6 tasks × codegraph on/off × `anthropic-cc/claude-opus-5-5` and `openai-codex/gpt-6.1-sol` × 3 repeats, each recording tokens, turns, codegraph calls and correctness, every on-arm cell offered the three tools and no off-arm cell offered any — verified by `bun bench/verdict.ts`, which exits non-zero on a missing, malformed or mis-armed cell
- [ ] `bun bench/verdict.ts` prints `keep`, `freeze` or `retire` by `bench/thresholds.json`: keep when the codegraph arm is correct at least as often and cuts median tokens or turns by ≥25% on at least half the tasks, both models pooled; retire when it wins on no task; freeze otherwise — verified by `bun test test/bench-verdict.test.ts` and that command
- [ ] `space/decisions/0002-*.md` records the verdict `bun bench/verdict.ts` prints, with its per-task numbers, and `NOW.md` routes its consequence — verified by a read at close against that command's output, dated
- [ ] `symbolGraph`, `impact` and `trace` return their lookup status beside their text, and each tool's `execute()` in `src/index.ts` takes `isError` from it, not from a `findNodes` call of its own — verified by `bun test test/extension-not-found-is-error.test.ts` and a test of each function's status
- [ ] `src/config/dev-mode.ts` is gone, no file under `src/` or `test/` names `CODEGRAPH_DEVMODE` or `devModeEnabled`, `README.md` names neither `CODEGRAPH_DEVMODE` nor a `[source: agent]` label, and ROADMAP's Principle 6 describes the read-only surface — verified by `bun test test/docs-tool-surface.test.ts` and `bun run check && bun test`
- [ ] On a `keep` verdict, the latest `main` CI run shows `test/pi-host-load.test.ts` passing under `node`, `Test & Type-check` green on Node 22 and the current Node, and `test/output-hashline-compat.test.ts`'s sibling case run, not skipped, against a pi-hashline-readmap clone; on `freeze` or `retire`, that work sits in Out of scope citing decision 0002 — verified by `gh run view <id> --log` at close, or a read of this file

## Now
slice 2 (Freeze the task set before any run) is next, no branch yet. Next action: run `slice` in a fresh session.

## Seams
- Bench runner: `bench/run.ts` drives `pi -p --mode json --no-session` for one cell (task × arm × model × repeat) in a pinned worktree of the target repo, codegraph on by default and off by `-xt symbol_graph,impact,trace`; observed as `bench/results/<cell>.json`; tests in `test/bench-run.test.ts` against a recorded transcript fixture.
- Grader: `bench/grade.ts` scores a cell's final answer against its task's key; tests in `test/bench-grade.test.ts`.
- Verdict: `bench/verdict.ts` reads `bench/results/` and `bench/thresholds.json`; tests in `test/bench-verdict.test.ts` on fixture results.
- Tool functions: `symbolGraph`, `impact`, `trace` in `src/tools/`; tests in `test/tool-*.test.ts`.
- Extension surface: each tool's `execute()` in `src/index.ts`, through a fake `ExtensionAPI` in `test/extension-*.test.ts` and pi's real loader in `test/pi-host-load.test.ts`.
- Docs: `README.md`, `ROADMAP.md`; test in `test/docs-tool-surface.test.ts`.
- CI: `.github/workflows/ci.yml`; observed through `gh run list` and `gh run view`.

## Slices
1. **Drive one graded cell headless** — delivers `bench/run.ts` running one pilot question in a pinned worktree of a target repo, codegraph on or off, the graph indexed before the timed run, writing tokens, turns, codegraph calls, offered tools and the final answer to `bench/results/pilot/`, graded by `bench/grade.ts` · proof the pilot on both arms on both models, the on-arm transcript offering the three tools and the off-arm none; `bun test test/bench-run.test.ts test/bench-grade.test.ts` red → green · blocked-by — · status done
   `bench/run.ts` runs one cell in a fresh pinned worktree (deps installed, on arm indexed first) through `pi -p --mode json` with `-ne` and this checkout's codegraph, the off arm by `-xt`, and writes the cell graded by `bench/grade.ts`'s `<answer>` block against `key.all`/`key.none` · deviation: none; settles both Not-yet-specified items (usage per `message_end` for both providers; codegraph from this checkout, `--thinking high`) · evidence: 4 pilot cells all correct, on arms offered the three tools and off arms none; `bun test` 489 pass · `00742af6`
2. **Freeze the task set before any run** — delivers 6 questions (2 impact, 2 test-mapping, 2 trace) worded as a user would ask them with no tool named, their pinned commits, answer keys checked with grep, read and `lsp` rather than codegraph, `bench/thresholds.json`, and `bench/verdict.ts` with its audit · proof `bun test test/bench-verdict.test.ts` red → green on fixture results; the commit lands with no `bench/results/` file beyond the pilot's · blocked-by 1 · status next
   From slice 1: pilot files under `bench/results/pilot/` land before `bench/tasks/`, so done-when 1's `git log` lists them first and `bench/verdict.ts` must skip `pilot/`.
   From slice 1: a cell records `index.errors`, which nothing audits beyond `bench/run.ts`'s exit code; the verdict audit should reject an on-arm cell with index errors.
3. **Run the 72 cells** — delivers `bench/results/` with every cell graded and the verdict printed · proof `bun bench/verdict.ts` exits 0 and prints the verdict; the token spend recorded in the reconcile line · blocked-by 2 · status next
4. **Record the verdict** — delivers `space/decisions/0002-*.md` with the verdict and per-task numbers, `NOW.md` routing its consequence, and this arc reshaped to keep or drop slice 7 · proof a read of the decision against `bun bench/verdict.ts`'s output · blocked-by 3 · status next
5. **Return the lookup status from the tool functions** — delivers `symbolGraph`, `impact` and `trace` reporting whether each requested name resolved to exactly one node, and `execute()` setting `isError` from that, the string-returning callers in `test/` kept working · proof `test/extension-not-found-is-error.test.ts` stays green, a new status test red → green, `bun run check && bun test` · blocked-by — · status next
6. **Retire the dev-mode remnants** — delivers `src/config/dev-mode.ts`, `test/dev-mode.test.ts` and the `CODEGRAPH_DEVMODE` toggles in the 12 tests that set it removed, README's dev-mode line and `[source: agent]` label dropped, ROADMAP's Principle 6 rewritten for the read-only surface · proof `test/docs-tool-surface.test.ts` red → green on the new assertions, `bun run check && bun test` · blocked-by — · status next
7. **Exercise what CI skips** — delivers `test/pi-host-load.test.ts` loading the extension and calling a tool under `node` as well as Bun, `Test & Type-check` on Node 22 and the current Node, and CI cloning pi-hashline-readmap so the sibling case runs · proof the slice PR's CI log shows each running and green, then `main`'s · blocked-by 4 · status next
   Runs only on a `keep` verdict; slice 4 (Record the verdict) moves it to Out of scope otherwise.

## Not yet specified

## Out of scope
- Python support: decided after decision 0002.
- Edit-task benchmarks.
- Uninstalling the extension or archiving the repo on a `freeze` or `retire` verdict: the owner's call after the arc.
- Changing the tools or their descriptions to raise pick rate.
- Custom TUI renderers (`renderCall`/`renderResult`).

## Decisions
- [0001 The public surface is three read-only tools](../decisions/0001-three-tool-public-surface.md)
