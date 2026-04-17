## Files Reviewed
- `src/index.ts` — tool registration surface, dev-mode gating, `symbol_graph` schema wiring
- `src/config/dev-mode.ts` — `CODEGRAPH_DEVMODE` parsing
- `src/tools/symbol-graph.ts` — `include:["contract"]` plumbing and output composition
- `src/tools/symbol-contract.ts` — shared contract renderer extraction and standalone tool wiring
- `README.md` — public/dev/internal tool surface docs and examples
- `ARCHITECTURE.md` — registered tool inventory and gating documentation
- `docs/tool-descriptions.md` — maintenance guidance for the new surface split
- `test/dev-mode.test.ts` — env parsing coverage
- `test/extension-devmode-tools.test.ts` — default/dev-mode registration and runtime behavior coverage
- `test/extension-symbol-search.test.ts` — internal-only registration regression and exported helper coverage
- `test/tool-symbol-graph-include-schema.test.ts` — schema validation and unchanged default-output coverage
- `test/tool-symbol-graph-contract-include.test.ts` — shared-renderer and empty-state coverage
- `test/extension-graph-query.test.ts` — dev-only `graph_query` wiring/runtime coverage
- `test/extension-graph-query-description.test.ts` — gated description coverage
- `test/tool-graph-overview-wiring.test.ts` — gated `graph_overview` registration coverage
- `test/tool-dead-code-wiring.test.ts` — gated `dead_code` registration coverage
- `test/extension-tool-descriptions.test.ts` — default public tool description inventory coverage

## Strengths
- `src/index.ts:181-183` captures `CODEGRAPH_DEVMODE` once at extension initialization, and `src/index.ts:323-339`, `src/index.ts:371-403` gate registration at the tool-surface boundary instead of branching inside handlers. That keeps the public surface stable for the lifetime of the extension instance and matches the spec cleanly.
- `src/index.ts:25-34` keeps the new `symbol_graph.include` contract narrow at the schema level. Unsupported values are rejected before tool execution rather than being handled ad hoc in runtime logic.
- `src/tools/symbol-contract.ts:63-170` extracts shared rendering into `renderSymbolContractBody`, and `src/tools/symbol-graph.ts:191-195` reuses it directly. That is the right design for AC10: one renderer, one empty-state path, one stale-marker path.
- `src/tools/symbol-graph.ts:100-197` preserves the existing neighborhood rendering path and appends the contract block only after the base body is complete. The change is additive and keeps the default behavior isolated.
- `test/extension-devmode-tools.test.ts:11-37` and `test/extension-devmode-tools.test.ts:39-123` cover both registration-time behavior and actual runtime behavior for `graph_query`, including the “do not change mid-session after load” requirement. That is meaningful regression coverage, not just existence checks.
- `test/tool-symbol-graph-include-schema.test.ts:29-67` and `test/tool-symbol-graph-contract-include.test.ts:72-108` lock the two failure-prone behaviors for this feature: default output staying byte-identical, and the appended contract content matching the shared standalone renderer.
- `test/extension-symbol-search.test.ts:7-52` verifies the intended surface split well: `symbol_search` is absent from registration while `symbolSearch` remains callable for internal consumers.
- `README.md:21-23`, `README.md:65-75`, `README.md:119-146`, `ARCHITECTURE.md:9-14`, `ARCHITECTURE.md:60`, and `ARCHITECTURE.md:251-263` update the docs consistently across overview, usage, and file-layout sections. The public/dev/internal split is clear and aligned with the code.
- `docs/tool-descriptions.md:24-26` keeps the style guide scoped to maintenance rules instead of over-documenting parameter details in top-level descriptions. That matches the project’s description-governance approach.

## Findings

### Critical
None.

### Important
None.

### Minor
None.

## Recommendations
- Consider extracting a tiny shared helper for truthy env-flag parsing so `src/config/dev-mode.ts:1-3` and `src/tools/token-tracker.ts:138-141` do not have to stay manually in sync. This is not a merge blocker; it is a drift-prevention cleanup.
- Consider a small test helper for temporary env overrides in registration tests. Multiple files now save/restore `process.env.CODEGRAPH_DEVMODE` inline; a shared helper would reduce repetition and make future gated-surface tests less error-prone.

## Assessment
ready

I found no correctness, maintainability, architecture, testing, or production-readiness issues that should block merge. The change is scoped correctly, keeps the default tool surface narrow, preserves the internal `symbolSearch` API, reuses a single contract-rendering path, and is backed by targeted regression tests plus the already-passing full suite.