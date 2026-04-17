# Brainstorm — Issue #061: M10 Phase 3 — Demote dev-mode tools; internalize `symbol_search`; begin absorbing `symbol_contract`

## Goal
Shrink the model-facing codegraph surface by moving three power-user tools (`graph_query`, `graph_overview`, `dead_code`) behind a single `CODEGRAPH_DEVMODE=1` env flag, removing `symbol_search` from the registered surface entirely (its exported function stays for internal disambiguation), and laying Phase-4 plumbing by giving `symbol_graph` an optional `include: ["contract"]` parameter that reuses the existing `symbol_contract` extractor. The graph, store, schema, indexer, and output ceremony from #064 are untouched.

## Mode
`Direct requirements`

The issue body, the refocus plan's Phase 3 section, and the M10 exit criteria already pin down the flag name, the tools to demote, the `symbol_search` demotion semantics, and the shape of the `symbol_graph` `include` plumbing. The brainstorm's job here is to lock the exact behavioral rules before spec.

## Must-Have Requirements

**Dev-mode gating**

- **R1** A single env var named `CODEGRAPH_DEVMODE` controls dev-mode tool registration. Any truthy value (`1`, `true`, `yes`, `on`, case-insensitive; matching the convention already used for `CODEGRAPH_DEVMETA`) enables it; unset / empty / `0` / `false` disables it.
- **R2** When `CODEGRAPH_DEVMODE` is not enabled, `graph_query` is **not** registered with pi.
- **R3** When `CODEGRAPH_DEVMODE` is not enabled, `graph_overview` is **not** registered with pi.
- **R4** When `CODEGRAPH_DEVMODE` is not enabled, `dead_code` is **not** registered with pi.
- **R5** When `CODEGRAPH_DEVMODE` is enabled, `graph_query`, `graph_overview`, and `dead_code` register with the same names, parameter schemas, descriptions, and behavior they have today.
- **R6** `CODEGRAPH_DEVMODE` is read once at extension-load time inside `piCodegraph(pi)`. Unlike `CODEGRAPH_DEVMETA` (R12 of #064), there is no mid-session toggle requirement — tool registration is a one-shot event.

**`symbol_search` demotion**

- **R7** `symbol_search` is removed from the registered model-facing tool set **unconditionally** — it does not come back even when `CODEGRAPH_DEVMODE=1`.
- **R8** The `symbolSearch` function (and any internal helpers, e.g. `resetSearchCacheForTesting`) continue to be exported from `src/tools/symbol-search.ts` so internal callers (disambiguation paths in `symbol_graph` / `impact` / `trace`, future CODI consumers) keep working.
- **R9** All existing internal call sites of `symbolSearch` continue to function unchanged.

**`symbol_graph` gains `include` plumbing (Phase-4 groundwork)**

- **R10** `symbol_graph` accepts an optional `include` parameter typed as `Array<"contract">` (a single-element union for now). Unknown values are rejected by the TypeBox schema.
- **R11** When `include` is omitted or empty, `symbol_graph`'s output is byte-for-byte identical to current behavior.
- **R12** When `include` contains `"contract"`, `symbol_graph`'s response appends a clearly delimited contract section whose content is produced by invoking the existing `symbolContract` extraction logic (same function / module that backs the standalone `symbol_contract` tool). The section is appended to the text output; it is not inlined mid-neighborhood.
- **R13** The contract section reuses the existing rendering of the standalone tool output so there is exactly one source of truth for how contracts render.
- **R14** When `include: ["contract"]` is requested but the symbol is not found or the contract extractor has nothing to emit, `symbol_graph` degrades gracefully: the main neighborhood output still renders, and the contract section either is omitted or shows a short "no contract info" note — whichever matches the existing empty-state behavior of `symbol_contract`.

**`symbol_contract` tool in this phase**

- **R15** The standalone `symbol_contract` tool **remains registered** in this phase with its current name, parameters, and output. Full removal is Phase 4.

**Docs & test reconciliation**

- **R16** `README.md` reflects the new default-mode tool surface: lists the tools registered when `CODEGRAPH_DEVMODE` is unset as the public surface, and documents `CODEGRAPH_DEVMODE=1` as the way to re-expose `graph_query`, `graph_overview`, and `dead_code`. `symbol_search` is removed from README's tool list; any public-API section that still references it moves to an "internal API" note.
- **R17** `ARCHITECTURE.md` is updated to (a) reflect the new registered set, (b) mention the dev-mode flag, and (c) note that `symbol_search` is internal.
- **R18** `docs/tool-descriptions.md` (from #064) is updated if any description text changes in this issue — e.g., `symbol_graph`'s description may gain a short mention of the new `include` option, subject to the style-guide rules.
- **R19** Tests that assert "which tools are registered" reflect the new default: `graph_query`, `graph_overview`, `dead_code`, and `symbol_search` are **not** registered by default.
- **R20** Tests added for `CODEGRAPH_DEVMODE=1`: `graph_query`, `graph_overview`, `dead_code` **are** registered; `symbol_search` is still **not** registered.
- **R21** Tests added for `symbol_graph` `include: ["contract"]`: default output unchanged, contract section appears when requested, uses the same extractor as `symbol_contract`.
- **R22** The full existing test suite passes after this change. Any test file that imports or exercises `symbol_search` as a registered tool is either rewritten to exercise the internal function directly or removed if redundant.

## Optional / Nice-to-Have
- **O1** A one-line log emitted at extension load indicating whether dev-mode is active, for discoverability during troubleshooting.
- **O2** An inline comment in `src/index.ts` next to each dev-mode registration block pointing at `codegraph-refocus-plan.md` so the next reader understands why the gating exists.
- **O3** Benchmark note (in PR description) showing before/after registered-tool count per mode, validating the "public surface drops from 11 to 7" exit criterion for this phase.

## Explicitly Deferred
- **D1** Full removal of standalone `symbol_card` and `symbol_contract` tools — Phase 4 / issue #062.
- **D2** Extending `symbol_graph`'s `include` parameter to accept `"neighborhood"`, `"signals"`, `"source"` — Phase 4 / issue #062.
- **D3** Evidence-driven deletion of `resolve_edge` / `delete_edge` based on CODI telemetry — Phase 5 / issue #063.
- **D4** Per-user or per-project config (pi config file, JSON, etc.) for which dev-mode tools to enable individually — single flag is sufficient for v1.
- **D5** Separate flag names per tool (e.g. `CODEGRAPH_ENABLE_GRAPH_QUERY=1`) — single `CODEGRAPH_DEVMODE` covers all three.
- **D6** Deprecation warnings inside tool outputs for removed tools — ruled out by the refocus plan's non-goals.
- **D7** Any change to the indexer, graph store, SQLite schema, or `.codegraph/` layout.
- **D8** Any change to output ceremony (Trust header, `_meta`) — owned by #059/#064.

## Constraints
- **C1** No change to any tool's `name`, parameter schema (except `symbol_graph` gaining optional `include`), or output semantics beyond what R10–R14 require.
- **C2** `symbol_search`'s exported function signature and behavior do not change; only its registration disappears.
- **C3** Gating is a single env var (`CODEGRAPH_DEVMODE`), read at extension load. No pi-config knob, no per-tool flags.
- **C4** `symbol_graph`'s default output (`include` omitted) must be byte-identical to today's output, to avoid hidden regressions in other callers or in the output-ceremony behavior from #064.
- **C5** Contract rendering inside `symbol_graph` must reuse the same extractor/renderer that `symbol_contract` uses — no divergent implementations.
- **C6** README and ARCHITECTURE must agree with `src/index.ts` after this change (invariant shared with #064's C6).
- **C7** The change is reversible: flipping the gating predicates re-registers the demoted tools; removing the `include` branch restores prior `symbol_graph` behavior.

## Open Questions
None.

## Recommended Direction

Introduce a small helper, e.g. `isDevModeEnabled(): boolean` in `src/index.ts` (or a new `src/config/dev-mode.ts` if #064's style guide suggests splitting it), that reads `process.env.CODEGRAPH_DEVMODE` once at extension load and normalizes truthy values to match `CODEGRAPH_DEVMETA`'s existing parser. In `piCodegraph(pi)`, wrap the `registerReadOnlyTool` calls for `graph_query`, `graph_overview`, and `dead_code` in an `if (devMode)` block. Delete the `registerReadOnlyTool` call for `symbol_search` unconditionally; keep its import only for the internal disambiguation paths.

For the `symbol_graph` `include` plumbing, extend `SymbolGraphParams` with an optional `Type.Array(Type.Union([Type.Literal("contract")]))`. Inside the `symbol_graph` execute handler, after the existing neighborhood text is produced, branch on `include?.includes("contract")` and append a section built by calling the same `symbolContract({...})` function used by the standalone tool. Deliberately keep the "include" union single-valued for this phase — Phase 4 will broaden it, and keeping the surface narrow now makes Phase 4's additions purely additive.

Docs reconciliation: update README's "11 tools" language and code-block lists; reshape the tool catalog into three groups — **Public** (symbol_graph, symbol_card, symbol_contract, impact, trace, resolve_edge, delete_edge), **Dev-mode** (graph_query, graph_overview, dead_code — behind CODEGRAPH_DEVMODE), and **Internal** (symbol_search). ARCHITECTURE's ASCII tool list and file-layout block are tweaked similarly, and a short dev-mode paragraph is added near the "Output Layer" section.

Tests split cleanly into four buckets: (1) default-mode registration assertion — the four demoted tools are absent; (2) dev-mode registration assertion — `graph_query` / `graph_overview` / `dead_code` are present, `symbol_search` is still absent; (3) `symbol_graph include: ["contract"]` — default output unchanged, contract section appears, extractor reuse verified; (4) suite regression — rerun existing 334+ tests, adjusting any that imported `symbol_search` as a registered tool to exercise the function directly.

## Testing Implications
- New test: default load → `pi.registerTool` is **not** called for `graph_query`, `graph_overview`, `dead_code`, `symbol_search`.
- New test: `CODEGRAPH_DEVMODE=1` load → `pi.registerTool` **is** called for `graph_query`, `graph_overview`, `dead_code`; still **not** called for `symbol_search`.
- New test: `CODEGRAPH_DEVMODE` accepts `1`, `true`, `yes`, `on` (case-insensitive); rejects unset, empty, `0`, `false`.
- New test: calling the registered `symbol_graph` tool with `include: ["contract"]` appends a contract section whose content matches what a direct call to `symbolContract({...})` would produce for the same symbol.
- New test: calling `symbol_graph` without `include` produces byte-identical output to pre-change behavior (snapshot or hash comparison against a known fixture).
- New test: TypeBox rejects `include: ["neighborhood"]` and similar non-`"contract"` values in this phase.
- Update: any `extension-symbol-search*.test.ts` that exercises `symbol_search` via `pi.registerTool` must be rewritten to call the exported function directly or removed if now redundant.
- Update: `extension-wiring.test.ts` (and any "registered tool count" assertion) adjusts for the new default count.
- README + ARCHITECTURE drift guard: spot-check that the tool names in README code blocks match the keys registered in `src/index.ts` under both modes (could be a fast grep-based test, or a manual code-review checklist item).
- Full test suite must pass green.
