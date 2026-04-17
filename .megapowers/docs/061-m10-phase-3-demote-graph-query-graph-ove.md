# M10 Phase 3: Demote Dev-Only Graph Tools and Add `symbol_graph` Contract Include

**Issue:** 061  
**Type:** feature  
**Milestone:** M10

---

## What Was Built

This change narrows the default model-facing tool surface for pi-codegraph while preserving the deeper graph tooling for explicit dev-mode sessions. It also adds a small but high-value composition feature to `symbol_graph` so agents can request a symbol contract inline without changing the default neighborhood output.

### 1. Dev-mode-only tool registration behind `CODEGRAPH_DEVMODE`

**Problem:** The extension registered `graph_query`, `graph_overview`, `dead_code`, and `symbol_search` on the default public surface even though some of those tools are better suited to advanced or internal use.

**Solution:**
- `src/config/dev-mode.ts` — new `devModeEnabled()` helper parses `CODEGRAPH_DEVMODE` once per extension initialization and accepts `1`, `true`, `yes`, and `on` case-insensitively.
- `src/index.ts` — `piCodegraph(pi)` now captures `const devMode = devModeEnabled();` once, then registers `graph_query`, `graph_overview`, and `dead_code` only when that flag is enabled.
- The default public surface is now 7 tools: `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`, `symbol_card`, and `symbol_contract`.
- The dev-only surface is now 3 tools behind `CODEGRAPH_DEVMODE=1`: `graph_query`, `graph_overview`, and `dead_code`.

**Invariant preserved:** When dev mode is enabled, all three dev-only tools keep their existing names, descriptions, schemas, and runtime behavior.

### 2. `symbol_search` removed from model-facing registration, preserved as internal API

**Problem:** `symbol_search` was still being registered as a public extension tool even though it is more appropriate as an internal helper.

**Solution:**
- `src/index.ts` no longer registers `symbol_search`.
- `src/tools/symbol-search.ts` still exports `symbolSearch()` and `resetSearchCacheForTesting()` unchanged for same-process internal callers and tests.
- Internal behavior and test coverage for the helper remain intact.

### 3. `symbol_graph.include: ["contract"]`

**Problem:** Agents could ask for a symbol neighborhood or a standalone behavioral contract, but could not request both in one `symbol_graph` call.

**Solution:**
- `src/index.ts` extends the `symbol_graph` TypeBox schema with optional `include`, restricted to the single literal value `"contract"`.
- `src/tools/symbol-graph.ts` accepts `include?: Array<"contract">` and appends a separate contract section only when requested.
- Omitted `include` and `include: []` preserve the exact pre-change `symbol_graph` bytes.

### 4. Shared contract renderer reused by both tools

**Problem:** Adding contract content to `symbol_graph` risked duplicating the rendering logic already implemented in `symbol_contract`.

**Solution:**
- `src/tools/symbol-contract.ts` now exports `renderSymbolContractBody()` plus a small `RenderedSymbolContract` result type.
- Standalone `symbolContract()` remains the trust-header wrapper around the shared renderer.
- `src/tools/symbol-graph.ts` reuses that shared renderer and appends the rendered body after the neighborhood section, keeping exactly one trust header in the combined response.
- Missing-symbol and no-contract-data cases reuse the same empty-state behavior as standalone `symbol_contract`.

### 5. Documentation and regression coverage reconciled to the new surface

**Docs updated:**
- `README.md` — now documents the 7 default public tools, the 3 dev-mode-only tools behind `CODEGRAPH_DEVMODE=1`, internal-only `symbol_search`, and `symbol_graph({ include: ["contract"] })`.
- `ARCHITECTURE.md` — now reflects the public/dev/internal split and marks file-layout entries accordingly.
- `docs/tool-descriptions.md` — maintenance guidance updated to keep the new split consistent and to keep `symbol_graph.include` details out of top-level tool descriptions.

**Regression tests added/updated:**
- new env parsing coverage for `CODEGRAPH_DEVMODE`
- new extension registration coverage for default vs dev-mode surfaces
- updated `symbol_search` extension-surface regression
- new `symbol_graph` include-schema and contract-append coverage
- updated wiring/description tests for dev-only tools now gated behind env

---

## Files Changed

| File | Change |
|------|--------|
| `src/config/dev-mode.ts` | New — load-time `CODEGRAPH_DEVMODE` parser |
| `src/index.ts` | Dev-mode registration gating, `symbol_graph.include` schema, `symbol_search` removal from public registration |
| `src/tools/symbol-graph.ts` | Optional contract append path added via shared renderer |
| `src/tools/symbol-contract.ts` | Extracted shared `renderSymbolContractBody()` for reuse |
| `README.md` | Public/dev/internal tool surface docs updated |
| `ARCHITECTURE.md` | Tool inventory and gating rule updated |
| `docs/tool-descriptions.md` | Maintenance guidance updated for the split surface |
| `test/dev-mode.test.ts` | New — truthy/disabled env parsing coverage |
| `test/extension-devmode-tools.test.ts` | New — default/dev-mode registration and runtime coverage |
| `test/tool-symbol-graph-include-schema.test.ts` | New — include schema and byte-identical default output coverage |
| `test/tool-symbol-graph-contract-include.test.ts` | New — shared-renderer append and empty-state coverage |
| `test/extension-symbol-search.test.ts` | Updated — internal-only surface regression |
| `test/extension-graph-query.test.ts` | Updated — explicit dev-mode registration test |
| `test/extension-graph-query-description.test.ts` | Updated — explicit dev-mode description test |
| `test/tool-graph-overview-wiring.test.ts` | Updated — explicit dev-mode wiring test |
| `test/tool-dead-code-wiring.test.ts` | Updated — explicit dev-mode wiring test |
| `test/extension-tool-descriptions.test.ts` | Updated — default 7-tool public surface contract |
| `test/extension-readonly-trust-gating.test.ts` | Updated — registers dev-only tools under explicit dev mode |
| `test/readonly-graceful-degradation.test.ts` | Updated — dev-mode wrapper for `graph_query` extension registration |
| `test/token-tracker-wiring-check.test.ts` | Updated — default public tool list |
| `tests/ptc-metadata.test.ts` | Updated — PTC metadata expectations aligned to dev-only registrations |

Diff summary for the tracked file set in this issue: 16 tracked files changed, 386 insertions, 355 deletions, plus new helper and test files.

---

## Verification

- Full suite passed fresh: `bun test`
  - `432 pass`
  - `0 fail`
- Typecheck passed during verification scope: `tsc --noEmit`
- Targeted acceptance coverage confirmed:
  - default registration excludes `graph_query`, `graph_overview`, `dead_code`, and `symbol_search`
  - `CODEGRAPH_DEVMODE=1` re-enables `graph_query`, `graph_overview`, and `dead_code`
  - `symbol_search` remains internal-only while `symbolSearch()` stays exported
  - `symbol_graph.include:["contract"]` is schema-validated and byte-identical when omitted/empty
  - appended contract output matches the standalone `symbol_contract` render path exactly

---

## Why It Matters

This reduces default tool-surface noise for models, keeps advanced graph exploration opt-in via one explicit environment flag, and lets agents combine structural neighborhood context with behavioral contract evidence in a single `symbol_graph` call without duplicating rendering logic or changing default output behavior.
