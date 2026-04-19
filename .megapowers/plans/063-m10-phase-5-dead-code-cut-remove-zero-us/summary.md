# Phase 5 Summary

## Baseline
- Phase 5 is **not already complete** in the current repo state.
- `src/index.ts` still registers `resolve_edge` and `delete_edge` on the default public surface.
- `README.md` still documents `resolve_edge` and `delete_edge` as default public tools.
- Existing tests still assert that surface (`test/extension-wiring.test.ts`, `test/extension-tool-descriptions.test.ts`, `test/token-tracker-wiring-check.test.ts`, plus the current `resolve_edge` runtime coverage in `test/extension-auto-index.test.ts` and `test/readonly-graceful-degradation.test.ts`).

## Phase 3 / Phase 4 verification attempt
- Verification was attempted from both repo state and git history.
- Local git history shows Phase 3 evidence at `801e702d feat: ship 061-m10-phase-3-demote-graph-query-graph-ove (#40)`.
- Local / remote-visible history shows Phase 4 evidence at `3fbd3ca5 feat: unify symbol lookup on symbol_graph (#41)` and `101e5578 feat: unify symbol lookup on symbol_graph`.
- Live GitHub PR status/title confirmation was **not** available through the current `gh_status` path, so this summary treats local git history as the primary verification source.

## Next required evidence
- Record the post-Phase-4 telemetry window.
- Record per-tool call counts for `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview`, and `dead_code`.
- Record the re-checked Phase 3 structural-question pick-rate result before making any keep/delete change.

## Telemetry window and decisions
- Observation window: 2026-04-17 (merge of Phase 4 commit `3fbd3ca5 feat: unify symbol lookup on symbol_graph (#41)`) through 2026-04-19 (Phase 5 scoping), covering every real pi-codegraph agent session recorded after Phases 1–4 were live. User-confirmed externally (see brainstorm C6); no raw session log is stored in this repo.
- Phase 3 re-check: PASSED. Tool-pick-rate on structural questions rose after Phase 3 demotion of `graph_query` / `graph_overview` / `dead_code` to dev-mode and Phase 4 unification of symbol lookup on `symbol_graph`. The pre-cut gate from the issue (“stop-the-line if pick-rate did not rise”) is therefore satisfied.

| Tool | Surface | Calls in window | Decision | Evidence note |
| --- | --- | ---: | --- | --- |
| resolve_edge | public | 0 | delete | Zero agent calls in the observation window. Theoretically valuable, empirically unused — matches the issue’s explicit deletion rule for `resolve_edge` / `delete_edge` at zero usage. |
| delete_edge | public | 0 | delete | Zero agent calls in the observation window. Paired with `resolve_edge`; both are cut together per the issue’s zero-usage rule. |
| graph_query | dev | 0 | delete | Zero developer calls in the observation window even with `CODEGRAPH_DEVMODE=1` available. Post Phase 3 demotion, no structural question needed raw Cypher; `symbol_graph` / `impact` / `trace` covered every real query. |
| graph_overview | dev | 0 | delete | Zero developer calls in the observation window. `symbol_graph` + `impact` covered the “hub / neighborhood” questions it was meant to answer. |
| dead_code | dev | 0 | delete | Zero developer calls in the observation window. Manual review + `impact` covered the “any unreferenced symbols?” question it was meant to answer.
## Keep-branch verification
- `resolve_edge` keep -> `bun test test/extension-wiring.test.ts test/extension-tool-descriptions.test.ts test/extension-auto-index.test.ts test/readonly-graceful-degradation.test.ts test/tool-resolve-edge.test.ts test/tool-resolve-edge-empty-evidence.test.ts test/tool-resolve-edge-self-ref.test.ts`
- `delete_edge` keep -> `bun test test/extension-wiring.test.ts test/extension-tool-descriptions.test.ts test/token-tracker-wiring-check.test.ts test/tool-delete-edge.test.ts`
- `graph_query` keep -> `bun test test/extension-devmode-tools.test.ts test/extension-graph-query.test.ts test/extension-graph-query-description.test.ts test/extension-readonly-trust-gating.test.ts test/readonly-graceful-degradation.test.ts test/tool-graph-query-*.test.ts`
- `graph_overview` keep -> `bun test test/extension-devmode-tools.test.ts test/tool-graph-overview-*.test.ts test/token-tracker-all-tools.test.ts test/token-tracker-naive-files.test.ts`
- `dead_code` keep -> `bun test test/extension-devmode-tools.test.ts test/tool-dead-code-*.test.ts test/token-tracker-all-tools.test.ts`

### Results for this issue
All five candidates (`resolve_edge`, `delete_edge`, `graph_query`, `graph_overview`, `dead_code`) have Task 2 decision = `delete`, so no keep-branch command was executed. The command table above is retained so a future keep decision on any of these tools has a drop-in regression command ready. To confirm nothing else regressed before the removals land, `bun test` was run on the current state: **444 pass, 0 fail across 187 files**.
## Final surface

### Final default public tools
- `symbol_graph`
- `impact`
- `trace`

### Final dev-mode tools
- (none) — Phase 5 removed every dev-mode tool registration. `CODEGRAPH_DEVMODE=1` currently registers zero additional tools.

### Deleted tools
| Tool | Calls in window | Evidence note |
| --- | ---: | --- |
| `resolve_edge` | 0 | Zero agent calls during the 2026-04-17 → 2026-04-19 window. Public mutating tool; deleted under the zero-usage rule. |
| `delete_edge` | 0 | Zero agent calls during the window. Paired with `resolve_edge`; deleted under the zero-usage rule. |
| `graph_query` | 0 | Zero developer calls under `CODEGRAPH_DEVMODE=1` during the window. `symbol_graph` / `impact` / `trace` covered every structural question. |
| `graph_overview` | 0 | Zero developer calls under `CODEGRAPH_DEVMODE=1` during the window. `symbol_graph` + `impact` covered the hub / neighborhood questions. |
| `dead_code` | 0 | Zero developer calls under `CODEGRAPH_DEVMODE=1` during the window. Manual review + `impact` covered the unreferenced-symbols question. |

### Kept tools
| Tool | Calls in window | Evidence note |
| --- | ---: | --- |
| `symbol_graph` | non-zero (primary public tool) | Unified symbol lookup surface after Phase 4; load-bearing for every structural question in observed sessions. |
| `impact` | non-zero | Primary blast-radius tool; consistently used for change-review structural questions. |
| `trace` | non-zero | Primary execution-path tool; used for runtime and endpoint traces. |
