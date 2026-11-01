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
slice 1 (Open a legacy DB on a read-only mount) is built, reviewed and open as PR #67 on branch `pi-1-4-current/01-legacy-db-read-only`, unmerged: its `Test & Type-check` is red only on `test/pi-host-load.test.ts` (`MCP_TYPESCRIPT_PREAMBLE` missing from the npm-resolved `pi-codemode`), red on `main` before this arc. Awaiting the human's call: merge #67 over that pre-existing failure, or land slice 2 (Pin the dev host to pi 1.4.0) and slice 3 (Install CI from the lockfile) first.

## Seams
- Extension surface: `piCodegraph(pi)` in `src/index.ts`; tests drive it through a fake `ExtensionAPI` in `test/extension-*.test.ts` and through pi's real loader in `test/pi-host-load.test.ts`.
- Tool result shape: `toolResult()` in `src/index.ts`, observed as each tool's `execute()` return; tests in `test/extension-host-contract.test.ts` and the new `test/extension-not-found-is-error.test.ts`.
- Graph store: `SqliteGraphStore` in `src/graph/sqlite.ts`; tests in `test/graph-store-*.test.ts`.
- CI: `.github/workflows/ci.yml`; observed through `gh run list` and `gh run view` on the PR and on `main`.
- Docs: `AGENTS.md`'s Tools table; test in the new `test/docs-tool-surface.test.ts`.

## Slices
1. **Open a legacy DB on a read-only mount** — delivers `SqliteGraphStore` opening a pre-#082 database in a read-only directory without throwing, `hasCoverageData()` returning false · proof `diagnose` names the root cause, then `test/graph-store-coverage-metadata-legacy-db.test.ts` goes red → green with the rest of `bun test` · blocked-by — · status done
   `SqliteGraphStore`'s constructor skips the schema migration on a primary `SQLITE_READONLY` code, since `CREATE … IF NOT EXISTS` on a missing table is a real write · deviation: added a Node-subprocess test and a not-a-database test to the legacy-DB file, from review and the mutation probe · evidence: the legacy-DB test red (`attempt to write a readonly database`) → green, its Node case green on Node 22.23.4 and 26.13.0, `bun run check && bun test` 467 pass 0 fail
2. **Pin the dev host to pi 1.4.0** — delivers `devDependencies` `@earendil-works/pi-coding-agent` exactly `1.4.0` with `bun.lock` regenerated, type-checking and loading against it · proof `bun run check && bun test`, then the `AGENTS.md` Prove command prints `Trust:` and a `path  LINE:HASH` anchor · blocked-by 1 · status next
3. **Install CI from the lockfile** — delivers the `Test & Type-check` job installing from `bun.lock` frozen on a pinned Bun version, the required check name kept, and the weekly `Compatibility (latest pi host)` job left on latest pi and Bun · proof both jobs green on the slice PR, then on `main` after merge · blocked-by 2 · status next
4. **Retire the legacy ptc metadata** — delivers tool definitions without `ptc`, and `test/extension-host-contract.test.ts` asserting the 1.4 surface: namespace, `outputSchema`, read-only annotations, no `ptc` · proof the contract test red (asserting no `ptc`) → green · blocked-by 2 · status next
5. **Flag not-found lookups as errors** — delivers not-found results from `symbol_graph`, `impact` and `trace`, and ambiguous results from `symbol_graph`, returned with `isError: true`, the message and suggestions kept in `content` and `structuredContent` · proof `test/extension-not-found-is-error.test.ts` red → green, then the Prove command with a missing name shows the error flag · blocked-by 2 · status next
6. **Bring the docs to the three-tool surface** — delivers `AGENTS.md` (Tools table, tool count, Key Design Decisions, Milestones), `ROADMAP.md` and `PRD.md` describing the three tools and M10 done, and `README.md` naming pi 1.4.0 as the tested host · proof `test/docs-tool-surface.test.ts` red → green, then a read of `ROADMAP.md` and `PRD.md` · blocked-by — · status next

## Not yet specified
- `impact` with some symbols found and some missing: whether that call is an error or a success that names the missing ones.
- Whether `bun install` runs the tree-sitter native build in CI or needs `trustedDependencies`; the current job rebuilds it with `npm --prefix`.
- Whether `pi-hashline-readmap` changed its anchor format since pi 1.1; `test/output-hashline-compat.test.ts` covers it only with the sibling repo checked out.

## Out of scope
- Custom TUI renderers (`renderCall`/`renderResult`): a next arc if needed.
- Namespace `aliases`, `reachesTools`, `before_agent_start`: not applicable to a read-only extension with the namespace `codegraph`.
- Any new tool capability.

## Decisions
- [0001 The public surface is three read-only tools](../decisions/0001-three-tool-public-surface.md)
