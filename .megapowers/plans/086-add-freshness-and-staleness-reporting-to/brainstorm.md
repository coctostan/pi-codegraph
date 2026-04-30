## Goal
Add compact, actionable freshness and staleness reporting to the public graph-backed tools so agents can tell whether a returned result reflects the current working tree, whether only part of the result is stale, and what to do before relying on stale graph data.

## Mode
Direct requirements

The issue already defines the desired behavior, affected tools, acceptance criteria, and non-goals. Brainstorming is mainly about preserving those requirements clearly and identifying current architecture constraints.

## Must-Have Requirements
R1. Fresh graph results must render a compact one-line freshness/trust status by default.

R2. Stale or uncertain graph results must expand the freshness/trust output with actionable detail.

R3. Freshness reporting must apply to `symbol_graph`.

R4. Freshness reporting must apply to `impact`.

R5. Freshness reporting must apply to `trace`.

R6. Freshness evaluation must compare current file content hashes against indexed node and edge content hashes.

R7. Freshness evaluation must detect indexed source files that no longer exist.

R8. Freshness evaluation must use indexed timestamps when available.

R9. Freshness evaluation must detect stale edges whose source evidence file has changed.

R10. Freshness reporting must be scoped to whether staleness affects the requested symbol or returned result, not only whether the project has any stale file globally.

R11. Stale graph results must identify changed or deleted files relevant to the returned result.

R12. Stale graph results must identify affected symbols when that can be determined.

R13. `impact` must warn when stale dependencies may make blast-radius results incomplete.

R14. `trace` must warn when stale call edges may make the execution path unreliable.

R15. `symbol_graph` must distinguish between a stale target symbol and stale neighborhood edges.

R16. Partially stale results must be distinguishable from fully stale results.

R17. `suppressTrustHeader: true` must suppress the freshness/trust header consistently across all affected public tools.

R18. Tests must cover fresh results.

R19. Tests must cover stale target-file results.

R20. Tests must cover stale neighbor-edge results.

R21. Tests must cover deleted-file results.

R22. Tests must cover suppressed-header results.

R23. Fresh output must stay terse and avoid spending tokens unless freshness is degraded.

R24. Freshness reporting must remain compact and agent-actionable.

## Optional / Nice-to-Have
O1. Use a small typed shared result such as `FreshnessReport` with `status`, `staleFiles`, `deletedFiles`, `affectedSymbols`, `staleEdgeCount`, and `message`.

O2. Include affected symbol names in stale reports whenever they can be cheaply derived from existing graph data.

O3. Reuse existing row-level `[stale]` markers as local evidence alongside the higher-level freshness summary.

## Explicitly Deferred
D1. Do not build a full automatic reindex daemon in this issue.

D2. Do not add broad token or cost analytics.

D3. Do not add natural-language graph explanations.

D4. Do not change the public tool set unless needed for internal implementation.

D5. Do not expand this into a general graph report or path traversal feature.

## Constraints
C1. The public tool surface should remain `symbol_graph`, `impact`, and `trace`.

C2. Existing `suppressTrustHeader` behavior must continue to work.

C3. The implementation should centralize freshness evaluation in the output or graph layer rather than duplicating logic independently in each tool.

C4. The implementation should reuse existing graph data where possible, especially node content hashes, edge provenance content hashes, `file_hashes`, and existing indexed timestamps.

C5. The existing auto-refresh behavior means ordinary writable tool invocations should usually be fresh; stale reporting still matters for readonly DBs, failed indexing, stale coverage traces, stale agent/LSP/framework/git evidence, deleted files, and partial/local exceptions.

C6. The current M10 direction favors low ceremony and low token overhead, so fresh-path reporting should be minimal and degraded-path reporting should spend tokens only on actionable detail.

C7. Existing anchors, provenance labels, signal badges, and row-level stale markers should not regress.

C8. Freshness computation should be deterministic enough for unit tests and should avoid depending on wall-clock wording except where indexed timestamps are explicitly reported.

## Open Questions
None.

## Recommended Direction
Build a shared freshness-reporting layer rather than adding bespoke stale-message logic to each tool. The current `GraphStatistics.files.stale` mechanism is useful but too global; add a result-scoped evaluator that can inspect the nodes, edges, and trace steps actually returned by a tool and produce a compact `FreshnessReport`.

The report should classify results as `fresh`, `partial`, `stale`, or `unknown`. `fresh` should render as a one-line status. Degraded statuses should include only relevant changed/deleted files, affected symbols when derivable, stale edge counts when applicable, and a short tool-specific warning. For example, `impact` should warn that blast radius may be incomplete, while `trace` should warn that the path may be unreliable.

Each public tool should pass its resolved target node and returned result items into the shared evaluator. `symbol_graph` should distinguish target-symbol staleness from stale neighborhood edges. `impact` should evaluate the changed symbols and the dependency path results it returns. `trace` should evaluate coverage trace steps or static call-path nodes and identify stale/unresolved steps.

Keep `suppressTrustHeader` centralized in `finalizeReadOnlyOutput` if possible. The implementation should preserve current output guarantees while replacing or augmenting the existing coarse `## Trust` header with the new compact/actionable freshness summary.

## Testing Implications
- Add unit tests for the shared freshness evaluator: fresh, changed file, deleted file, stale edge evidence, partial result, and unknown/unavailable file cases.
- Add `symbol_graph` tests for fresh target, stale target, stale neighbor edge, and suppressed header.
- Add `impact` tests verifying stale dependency warnings and incomplete-blast-radius wording.
- Add `trace` tests verifying stale coverage/static path warnings and deleted/unresolved step reporting.
- Add extension-level tests proving `suppressTrustHeader: true` suppresses the new freshness header consistently.
- Run `bun test` and `bun run check`.
