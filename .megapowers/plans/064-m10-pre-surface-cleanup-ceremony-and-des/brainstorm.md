# Brainstorm — Issue #064: M10 pre-surface cleanup (ceremony + descriptions)

## Goal
Ship the two M10 phases that are independent of CODI telemetry and external surface decisions: **strip per-call output ceremony on fresh calls** (Phase 1 / issue #059) and **normalize tool descriptions while reconciling README/code drift** (Phase 2 / issue #060). Both are reversible, API-shape-preserving, and aimed at raising codegraph's model-pick rate by reducing noise and improving the signal each description carries.

## Mode
`Direct requirements`

Both source issues already specify concrete gating rules, a style guide, concrete rewrite baselines, and reconciliation targets. The brainstorm's job is to lock those requirements down in one artifact before spec.

## Must-Have Requirements

**Phase 1 — Output ceremony**

- **R1** The Trust header is rendered only when the tool call's `TrustStatus` is not `fresh` (i.e., `stale`, `mixed`, `heuristic`, or `runtime-backed`). On `fresh` calls, no Trust header is emitted at all.
- **R2** The `_meta: tokens_saved:…` footer is suppressed by default. It is emitted only when the environment variable `CODEGRAPH_DEVMETA=1` (or equivalent truthy value) is set.
- **R3** Per-edge provenance labels (e.g. `[source: lsp]`) remain rendered on every call — they are load-bearing for trust assessment and are not part of the header.
- **R4** Per-symbol signal badges (e.g. `[hub]`, `[tested]`, `[bottleneck]`) remain rendered on every call.
- **R5** The `indexing-failed: graph may be stale (readonly database)` note continues to render whenever `lastIndexError` is set, regardless of Trust status.
- **R6** All read-only tools (all 11 currently registered) follow the same ceremony rules — no per-tool exceptions.
- **R12** `CODEGRAPH_DEVMETA` is read per tool call, not cached at module load, so a developer can toggle it during a long-running pi session without restart.

**Phase 2 — Descriptions**

- **R7** A tool-description style guide is codified in the repo. Rules: (a) single terse first line of the form "Do X when Y"; (b) optional "When to use:" block of 1–2 lines only if the trigger is not obvious; (c) no inline examples in descriptions; (d) no cross-references to other tools by name; (e) parameters self-describe via the TypeBox schema and are not re-described in the top-level `description`.
- **R8** All 11 currently registered tools have their `description` fields rewritten to conform to the style guide. The baselines in issue #060 are used for `symbol_graph`, `trace`, `impact`; the other 8 are rewritten in the same style.
- **R9** `README.md` is reconciled to list exactly the tools registered in `src/index.ts` (i.e., all 11 for now — surface cuts come in later M10 phases).
- **R10** `ARCHITECTURE.md` is reconciled to match the registered tool set and to reference the new style guide.
- **R11** All existing tests pass. Any snapshot/golden-output tests that fix the Trust header or `_meta` line are updated to match the new behavior.
- **R13** The style guide lives in a dedicated `docs/tool-descriptions.md`. `ARCHITECTURE.md` carries a one-line pointer to it rather than embedding the guide inline.
- **R14** The spec-phase artifact (`spec.md`) contains the full proposed text for all 11 tool descriptions as a current→proposed table, so the rewrites are reviewed and approved once during spec rather than bikeshed during code-review.

## Optional / Nice-to-Have
- **O1** Include a measurable before/after token count for a representative call (e.g., in the PR description), so the "tokens drop measurably on fresh calls" success signal is documented rather than assumed.
- **O3** Add a brief one-line comment above each `description:` in `src/index.ts` pointing at `docs/tool-descriptions.md`, so drift is obvious in code review.

## Explicitly Deferred
- **D1** Demoting `graph_query`, `graph_overview`, `dead_code` behind `CODEGRAPH_DEVMODE` (M10 Phase 3 / issue #061).
- **D2** Making `symbol_search` internal-only (M10 Phase 3 / issue #061).
- **D3** Folding `symbol_contract` into `symbol_graph` via `include` and removing `symbol_card` / `symbol_contract` (M10 Phase 4 / issue #062).
- **D4** Evidence-driven deletion of `resolve_edge` / `delete_edge` (M10 Phase 5 / issue #063).
- **D5** Per-user config for which dev-mode features to enable — a single env flag is sufficient.
- **D6** Deprecation warnings in tool output — explicitly ruled out by the refocus plan's non-goals.
- **D7** Any change to the indexer, graph store, SQLite schema, or `.codegraph/` layout.

## Constraints
- **C1** No change to any tool's `name`, `parameters` schema, or output semantics besides header/footer gating. Descriptions and output ceremony are the only surfaces this issue touches.
- **C2** The set of registered tools stays at the current 11 — no additions, no removals, no gating of whole tools in this issue.
- **C3** Gating mechanism for `_meta` must be a single environment variable (`CODEGRAPH_DEVMETA=1`) rather than a pi-config knob.
- **C4** The change must be reversible by flipping the gating logic — no state, schema, or persisted-graph format changes.
- **C5** Provenance and signal badges are not considered "ceremony" and must not be touched.
- **C6** `src/index.ts` is the source of truth; `README.md` and `ARCHITECTURE.md` must agree with it after this change.

## Open Questions
None.

## Recommended Direction

Treat this as two independent, sequential, small diffs behind a single batch: **(a) ceremony gating**, then **(b) description rewrites + doc reconciliation**.

For (a), introduce a small gating helper in the output layer — e.g., `shouldRenderTrustHeader(status)` and `devMetaEnabled()` (reading `process.env.CODEGRAPH_DEVMETA` each call per R12) — and wire them into the existing `prependTrustHeader` and `appendTokenMeta` call sites. Keep `lastIndexError` / `indexingFailedNote` orthogonal so the readonly-DB warning is unaffected. Update any snapshot tests that assert the now-suppressed lines; add targeted tests that assert (i) fresh calls emit no Trust header and no `_meta`, (ii) stale/mixed/heuristic/runtime-backed calls still emit the header, (iii) `CODEGRAPH_DEVMETA=1` re-enables the `_meta` footer.

For (b), write `docs/tool-descriptions.md` first (one file, a few hundred words, worked examples of compliant and non-compliant descriptions). In the spec phase, draft all 11 proposed descriptions as a current→proposed table inside `spec.md` (per R14) — `symbol_graph`, `trace`, `impact` use the baselines from issue #060; the other 8 are drafted in the same shape for reviewer approval. Implement rewrites mechanically from the approved table. Then reconcile `README.md` and `ARCHITECTURE.md` against the registered set and add the pointer to the style guide.

The two sub-changes can land in one commit or two; they don't depend on each other.

## Testing Implications
- New unit tests covering Trust header gating: fresh → no header; each non-fresh status → header rendered with current format.
- New unit tests for `_meta` gating: env unset → no footer; `CODEGRAPH_DEVMETA=1` → footer rendered as today; env-flag flip mid-session is observed on the next call (validates R12).
- Update any existing snapshot / golden-output tests that embed the Trust header or `_meta` line to reflect the new default-off behavior.
- Assert the readonly-DB `indexing-failed:` note still renders independently of Trust status.
- Optional smoke test: a small fixture proving fresh-call output byte length strictly decreases vs. the pre-change baseline (supports O1 and the "tokens drop measurably" exit criterion).
- A registration-level assertion that every registered tool has a non-empty `description` string (guards against future regressions).
- Full existing test suite must pass unchanged after the rewrite.
