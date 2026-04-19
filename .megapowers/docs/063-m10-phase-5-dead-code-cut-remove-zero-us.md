# M10 Phase 5 — Dead-Code Cut: Remove Zero-Usage Tools

**Issue:** 063-m10-phase-5-dead-code-cut-remove-zero-us
**Milestone:** M10 (public-surface refocus)
**Type:** feature (surface reduction)

## Summary

Phase 5 closes the M10 public-surface refocus. After Phases 3 and 4 demoted
`graph_query` / `graph_overview` / `dead_code` to dev-mode and unified symbol
lookup on `symbol_graph`, this phase took an evidence-driven cut at the
remaining tool surface: any candidate tool with zero observed usage in the
post-Phase-4 telemetry window was removed entirely — registration, schema,
implementation, docs, and tests — with no deprecation shim, alias, or warning
text.

After this cut, the pi-codegraph extension registers exactly **3 public tools**
(`symbol_graph`, `impact`, `trace`) and **0 dev-mode tools**. `symbol_search`
remains as an internal helper only.

## Why

The roadmap goal for M10 was to make every registered tool earn its slot on
the agent surface. Phase 3 demoted candidates behind `CODEGRAPH_DEVMODE=1`;
Phase 4 unified symbol lookup. Phase 5 was the last gate: hold tools to actual
observed usage and delete the ones nobody calls.

Aesthetic cleanup was explicitly forbidden — every removal had to be tied to
its own zero-count entry in a recorded telemetry window.

## What Changed

### Removed tools (zero observed usage)

| Tool | Surface | Calls in window |
| --- | --- | ---: |
| `resolve_edge` | public | 0 |
| `delete_edge` | public | 0 |
| `graph_query` | dev-mode | 0 |
| `graph_overview` | dev-mode | 0 |
| `dead_code` | dev-mode | 0 |

For each tool the registration block in `src/index.ts`, the TypeBox schema,
the source module(s), the README and `ARCHITECTURE.md` listings, and every
dedicated test file were removed. Surface tests for the still-registered
public tools were rewritten to drive their assertions from a single decision
matrix (`test/phase5-decision-matrix.ts`), so future changes can never let
documentation, registration, and tests drift apart again.

### Final registered surface

- **Public:** `symbol_graph`, `impact`, `trace`
- **Dev-mode (`CODEGRAPH_DEVMODE=1`):** none
- **Internal-only (not registered):** `symbol_search`

### Symbol-graph confirmation

Real signature pulled from `src/index.ts` (the extension entry point):

```ts
export default function piCodegraph(pi: ExtensionAPI): void
```

This function now registers only `symbol_graph`, `impact`, and `trace` via
the local `registerReadOnlyTool` helper. The previous dev-mode branch that
called `registerReadOnlyTool(pi, { name: "graph_query", ... })` and friends
under `if (devMode)` is gone; there is no `if (devMode)` branch in
`piCodegraph` after Phase 5.

Helpers exported for tests are unchanged in shape:

```ts
export function getSharedStoreForTesting(): GraphStore | null
export function getLastIndexErrorForTesting(): Error | null
export function resetStoreForTesting(): void
```

## Verification

- `bun test`: 379 pass, 0 fail across 163 files.
- Decision-matrix-driven consistency check confirms README, ARCHITECTURE,
  `src/index.ts`, and the surface tests agree on the final set of registered
  tools and the count of public/dev-mode tools.
- Per-removal phase5 surface test (`test/phase5-*-surface.test.ts`) asserts
  each removed tool name is no longer registered, including under
  `CODEGRAPH_DEVMODE=1` for the dev-mode trio.

## Files Changed (high-level)

- `src/index.ts` — removed five tool registrations, schemas, and imports.
- `src/tools/{resolve-edge,delete-edge,graph-query,graph-query-parser,graph-query-compiler,graph-query-render,graph-overview,dead-code}.ts` — deleted.
- `src/tools/token-tracker.ts` — `collectNaiveFiles()` no longer references the removed tools.
- `README.md`, `ARCHITECTURE.md` — final surface (3 public, 0 dev-mode, 1 internal helper).
- Tests — deleted ~30 dedicated test files for removed tools; added five
  `phase5-*-surface.test.ts` guards plus `phase5-decision-matrix.ts` as the
  single source of truth; rewired `extension-tool-descriptions`,
  `token-tracker-wiring-check`, `extension-devmode-tools`,
  `token-tracker-all-tools`, and `token-tracker-naive-files` to read from the
  decision matrix.
- `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md` — baseline,
  verification limitation, telemetry window, and final surface table.

## Known Limitations

- Live GitHub PR metadata for Phase 3 and Phase 4 was not retrievable through
  `gh_status` during this slice, so verification of those phases relied on
  local git history (`801e702d`, `3fbd3ca5`, `101e5578`). The summary records
  this explicitly.
- The decision matrix encodes per-tool keep/delete decisions; reversing a
  decision later requires both the matrix change and the regression run
  recorded in the keep-branch verification table in `summary.md`.
