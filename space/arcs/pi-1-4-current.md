---
status: active
---
# Current with pi 1.4.0

## Destination
pi-codegraph is green on an exact pi 1.4.0 dev pin with reproducible CI and a weekly latest-host canary, its three tools follow the 1.4 extension conventions that apply to a read-only tool extension, and its docs describe the three-tool surface.

## Done when
- [ ] `bun install --frozen-lockfile && bun run check && bun test` passes on a clean checkout of `main` — verified by that command
- [ ] The latest `main` push runs both CI jobs, `Test & Type-check` and `Compatibility (latest pi host)`, green — verified by `gh run list --branch main --limit 1 --json conclusion,jobs` and `gh run view <id>`
- [ ] `package.json` pins `@earendil-works/pi-coding-agent` to exactly `1.4.0` in `devDependencies`, and the `AGENTS.md` Prove command run against it prints a `Trust:` line and a `path  LINE:HASH` anchor for `symbol_graph {"name":"indexProject"}` — verified by that command
- [ ] Every registered tool declares namespace `codegraph`, an `outputSchema` and read-only annotations, and none carries `ptc` metadata — verified by `bun test test/extension-host-contract.test.ts`
- [ ] A missing symbol through `symbol_graph`, `impact` or `trace`, and an ambiguous name through `symbol_graph`, return `isError: true` with `structuredContent.text` holding the message and any suggestions — verified by `bun test test/extension-not-found-is-error.test.ts`
- [ ] `AGENTS.md`'s Tools table lists exactly `symbol_graph`, `impact` and `trace`, and none of `AGENTS.md`, `ROADMAP.md`, `PRD.md`, `README.md` presents a removed tool as current — verified by `bun test test/docs-tool-surface.test.ts` and a read of `ROADMAP.md` and `PRD.md` at close, dated

## Now
slice 6 (Bring the docs to the three-tool surface) is done: the four docs describe the three tools, M10 done and pi 1.4.0, merged as PR #72. Every slice is done. Next action: run `close` on pi-1-4-current (Current with pi 1.4.0) in a fresh session, including the dated read of `ROADMAP.md` and `PRD.md`.

## Seams
- Extension surface: `piCodegraph(pi)` in `src/index.ts`; tests drive it through a fake `ExtensionAPI` in `test/extension-*.test.ts` and through pi's real loader in `test/pi-host-load.test.ts`.
- Tool result shape: `toolResult()` in `src/index.ts`, observed as each tool's `execute()` return; tests in `test/extension-host-contract.test.ts` and the new `test/extension-not-found-is-error.test.ts`.
- Graph store: `SqliteGraphStore` in `src/graph/sqlite.ts`; tests in `test/graph-store-*.test.ts`.
- CI: `.github/workflows/ci.yml`; observed through `gh run list` and `gh run view` on the PR and on `main`.
- Docs: `AGENTS.md`'s Tools table; test in the new `test/docs-tool-surface.test.ts`.

## Slices
1. **Open a legacy DB on a read-only mount** — delivers `SqliteGraphStore` opening a pre-#082 database in a read-only directory without throwing, `hasCoverageData()` returning false · proof `diagnose` names the root cause, then `test/graph-store-coverage-metadata-legacy-db.test.ts` goes red → green with the rest of `bun test` · blocked-by — · status done
   `SqliteGraphStore`'s constructor skips the schema migration on a primary `SQLITE_READONLY` code, since `CREATE … IF NOT EXISTS` on a missing table is a real write · deviation: added a Node-subprocess test and a not-a-database test to the legacy-DB file, from review and the mutation probe; merged with `--admin` over `main`'s already-red `pi-host-load` check, the human's go · evidence: the legacy-DB test red (`attempt to write a readonly database`) → green, its Node case green on Node 22.23.4 and 26.13.0, `bun run check && bun test` 467 pass 0 fail, CI 462/2 fail → 465/1 fail · `38fa36ac`
2. **Pin the dev host to pi 1.4.0** — delivers `devDependencies` `@earendil-works/pi-coding-agent` exactly `1.4.0` with `bun.lock` regenerated, type-checking and loading against it · proof `bun run check && bun test`, then the `AGENTS.md` Prove command prints `Trust:` and a `path  LINE:HASH` anchor · blocked-by 1 · status done
   `devDependencies` pins `@earendil-works/pi-coding-agent` `1.4.0`, `bun.lock` regenerated (pi family to 1.4.0, `chord`/`esbuild` dropped, `marked-cjk-friendly` added), no `src/` change needed · deviation: none · evidence: installed host 1.4.0, `bun install --frozen-lockfile && bun run check && bun test` 467 pass 0 fail (467 on 1.1.0 before), `test/pi-host-load.test.ts` 1 pass, Prove command prints `Trust: fresh` and `src/indexer/pipeline.ts  53:ed2`, matching the file, PR CI both jobs green (`Test & Type-check` 466 pass 0 fail) · `68602b85`
3. **Install CI from the lockfile** — delivers the `Test & Type-check` job installing from `bun.lock` frozen on a pinned Bun version, the required check name kept, and the weekly `Compatibility (latest pi host)` job left on latest pi and Bun · proof both jobs green on the slice PR, then on `main` after merge · blocked-by 2 · status done
   `Test & Type-check` sets up Bun `1.4.4` and runs `bun install --frozen-lockfile` in place of `npm install --legacy-peer-deps`, name and tree-sitter compile step kept; `pi-latest` untouched · deviation: none · evidence: local `bun install --frozen-lockfile && bun run check && bun test` 467 pass 0 fail; frozen install in a clean worktree exits 0, exits 1 with a dependency added to `package.json` only (`is-number was added`); PR #69 run `41324387038`: `Test & Type-check` on `bun install v1.4.4` 466 pass 1 skip 0 fail, `Compatibility (latest pi host)` on latest Bun, host 1.4.0, 11 pass; review converged with no findings on both axes · `096039aa`
4. **Retire the legacy ptc metadata** — delivers tool definitions without `ptc`, and `test/extension-host-contract.test.ts` asserting the 1.4 surface: namespace, `outputSchema`, read-only annotations, no `ptc` · proof the contract test red (asserting no `ptc`) → green · blocked-by 2 · status done
   `registerReadOnlyTool` no longer sets `ptc`; the contract test asserts its absence; `tests/ptc-metadata.test.ts` deleted; README's `ptc` sentence dropped · deviation: none · evidence: contract test red (`ptc` present, 9 pass 1 fail) → green (10 pass); `bun run check && bun test` 464 pass 0 fail (467 − the 3 deleted `ptc` cases); through pi's real loader all three tools show `ptc` absent, namespace `codegraph`, `outputSchema`, read-only annotations, and the Prove command prints `Trust: fresh` and `src/indexer/pipeline.ts  53:ed2`, matching the file; review converged, 0 findings on both axes · `ad8df5bb`
5. **Flag not-found lookups as errors** — delivers not-found results from `symbol_graph`, `impact` and `trace`, and ambiguous results from `symbol_graph`, returned with `isError: true`, the message and suggestions kept in `content` and `structuredContent` · proof `test/extension-not-found-is-error.test.ts` red → green, then the Prove command with a missing name shows the error flag · blocked-by 2 · status done
   `toolResult()` takes an `isError` flag; each `execute()` sets it when a requested name does not resolve to exactly one node, the rule the tools render by, and `impact` also on an empty `symbols`; text and `structuredContent` unchanged · deviation: ambiguous `impact` and `trace`, and `impact` with no symbols, flag `isError` too, from review round 1, since none runs its analysis; mixed found/missing `impact` is an error, answering that Not yet specified item · evidence: new test red (5 fail, `isError` undefined) → green (7 pass), the round-2 cases red on round-1 code; mutation probe on each added condition red; `bun run check && bun test` 471 pass 0 fail (464 + 7); through pi's real loader 7 failure cases print `isError=true` with message and match list kept, 3 found cases `isError=false`, Prove command `Trust: fresh` and `src/indexer/pipeline.ts  53:ed2`, PR CI both jobs green (run `41328475849`) · `7f1b7431`
6. **Bring the docs to the three-tool surface** — delivers `AGENTS.md` (Tools table, tool count, Key Design Decisions, Milestones), `ROADMAP.md` and `PRD.md` describing the three tools and M10 done, and `README.md` naming pi 1.4.0 as the tested host · proof `test/docs-tool-surface.test.ts` red → green, then a read of `ROADMAP.md` and `PRD.md` · blocked-by — · status done
   `AGENTS.md` counts 3 read-only tools, its Tools table lists exactly the three, the agent-resolved-edges bullet becomes a read-only-surface one, Milestones points at ROADMAP; `ROADMAP.md` marks M10 complete with each phase's PR and an honest outcome list, and marks each removed tool `removed in M10` where history names it; `PRD.md` drops the two removed tool sections and takes the real input schemas; `README.md` names pi 1.4.0 and M0–M10 · deviation: a sixth test case guards ROADMAP's non-history sections, and PRD keeps `agent` provenance as legacy, both from review · evidence: new test red on `main` (5 fail) → green (6 pass), its ROADMAP case red under two mutations (a `## Tools` section naming `graph_query`; the status marker dropped); `bun run check && bun test` 477 pass 0 fail; Prove command prints `Trust: fresh` and `src/indexer/pipeline.ts  53:ed2` on host 1.4.0 · `f038d0a4`

## Not yet specified
- From slice 3: on Node 26 (local 26.13.0) a fresh `bun install` fails, since `tree-sitter` 0.25.0's `node-gyp` build hits `C++20 or later required` in Node 26's V8 headers. CI's Node 22 builds it, but the first done-when check, a clean checkout of `main`, fails on a Node 26 machine. Whether to pin Node for that check, raise `tree-sitter`, or accept it is open.
- Whether `pi-hashline-readmap` changed its anchor format since pi 1.1; `test/output-hashline-compat.test.ts` covers it only with the sibling repo checked out.

## Out of scope
- Custom TUI renderers (`renderCall`/`renderResult`): a next arc if needed.
- Namespace `aliases`, `reachesTools`, `before_agent_start`: not applicable to a read-only extension with the namespace `codegraph`.
- Any new tool capability.

## Decisions
- [0001 The public surface is three read-only tools](../decisions/0001-three-tool-public-surface.md)
