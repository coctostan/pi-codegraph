## Files Reviewed

- `src/output/freshness.ts` — new shared result-scoped freshness evaluator and compact header formatter.
- `src/output/read-only-ceremony.ts` — compact `Trust: ...` header stripping for `suppressTrustHeader`.
- `src/tools/symbol-graph.ts` — result-scope collection and freshness wrapping for `symbolGraph(params: SymbolGraphParams) => string`.
- `src/tools/impact.ts` — impact result nodes/edges passed to freshness evaluator, degraded-result recommendation, and stale edge propagation through `ImpactDetail`.
- `src/tools/trace.ts` — coverage/static trace freshness wrapping, unresolved coverage-step handling, deleted/stale trace-step handling, and static call-edge freshness collection.
- Freshness and suppress-header tests added/updated under `test/`, especially:
  - `test/output-freshness-evaluator.test.ts`
  - `test/output-compact-freshness-ceremony.test.ts`
  - `test/tool-symbol-graph-freshness-report.test.ts`
  - `test/tool-impact-freshness-warning.test.ts`
  - `test/tool-trace-freshness-warning.test.ts`
  - `test/tool-trace-static-edge-freshness.test.ts`
  - extension suppress-header tests for `symbol_graph`, `impact`, and `trace`.

## Advisory Review Status

Required advisory review commands were attempted early:

```text
/codex-review --base main
/bin/bash: /codex-review: No such file or directory

codex-review --base main
/bin/bash: codex-review: command not found
```

Because this changes public tool output shape, adversarial review was also attempted:

```text
/codex-adversarial-review --base main --focus "Public tool output API changes for result-scoped freshness/staleness reporting; check compatibility, stale-edge correctness, and suppressTrustHeader behavior."
/bin/bash: /codex-adversarial-review: No such file or directory

codex-adversarial-review --base main --focus "Public tool output API changes for result-scoped freshness/staleness reporting; check compatibility, stale-edge correctness, and suppressTrustHeader behavior."
/bin/bash: codex-adversarial-review: command not found
```

No advisory findings were produced because the review commands are unavailable in this environment; none were adopted or rejected.

## Strengths

- The shared evaluator is compact and result-scoped. `src/output/freshness.ts:25-33` accepts explicit `targetNodes`, `resultNodes`, `resultEdges`, and `unresolvedItems`, and `src/output/freshness.ts:126-133` deduplicates/inspects only those supplied items rather than global project state.
- Status precedence is readable and matches the feature semantics: unresolved items become `unknown`, stale requested targets become `stale`, stale returned context becomes `partial`, otherwise `fresh` at `src/output/freshness.ts:139-145`.
- Edge staleness uses the source node as the evidence file, as required, and records both source and target symbols when available at `src/output/freshness.ts:86-112`.
- Compact header rendering is deterministic and small. `src/output/freshness.ts:162-180` includes indexed timestamps as raw `indexed_at` values, avoids wall-clock wording, and includes recommendations only in degraded cases.
- `symbolGraph` preserves existing body renderers and adds freshness at the outer boundary instead of mixing freshness concerns into row rendering: `src/tools/symbol-graph.ts:264-303`.
- `impact` keeps the public `collectImpact` return shape stable by mapping `ImpactDetail` back to `ImpactItem` at `src/tools/impact.ts:125-133`, while carrying edge provenance internally through `ImpactDetail.edge` at `src/tools/impact.ts:25-29` and `src/tools/impact.ts:109-118`.
- `trace` has a small helper boundary: `traceFreshness` centralizes recommendation/scoping at `src/tools/trace.ts:127-146`, while `collectStaticTraceEdges` is a focused collector at `src/tools/trace.ts:149-157`.
- Suppress-header behavior is isolated in `src/output/read-only-ceremony.ts:1-8` and integrated through the existing read-only tool wrapper path in `src/index.ts:173-177`, so indexing-failed notes and metadata remain outside header stripping.
- Tests exercise behavior rather than only implementation details. For example, `test/tool-impact-freshness-warning.test.ts:32-39` mutates a caller file and asserts the visible degraded impact warning, stale edge count, and row stale marker.

## Breaking-Change / Impact Review

Command/tool: `impact` with `changeType: "signature_change"` on public/modified symbols:

```text
Trust: fresh
src/tools/impact.ts:171:7904  withFreshness  breaking  depth:1
src/tools/trace.ts:127:899f  traceFreshness  breaking  depth:1
src/tools/impact.ts:125:0e1d  collectImpact  breaking  depth:1
```

Review result:
- Public tool signatures are unchanged: `symbolGraph(params: SymbolGraphParams) => string`, `impact(params) => string`, and `trace(params: TraceParams) => string` remain intact.
- `ImpactDetail` gained an internal `edge` field, but the existing exported `collectImpact(params: CollectImpactParams): ImpactItem[]` strips that field at `src/tools/impact.ts:125-133`, preserving the old public `ImpactItem[]` shape for callers of `collectImpact`.
- The surfaced dependents are covered by tests that ran in verification: symbol graph freshness/trust tests, impact freshness/trust tests, trace freshness/static-edge tests, and suppress-header extension tests.

## Contract Review

`symbol_graph include:["contract"]` was run for changed public symbols:

- `evaluateFreshness(params: FreshnessEvaluationParams) => FreshnessReport` — simple contract, no guards/throws surfaced.
- `symbolGraph(params: SymbolGraphParams) => string` — simple contract, no guards/throws surfaced.
- `impact(params: { symbols; changeType; store; projectRoot; maxDepth? }) => string` — guards for missing symbols, invalid change type, ambiguous/not-found symbols, addition, and missing hit node. Existing tests cover those early-return paths plus new freshness headers.
- `trace(params: TraceParams) => string` — guard for ambiguous resolution surfaced; existing trace ambiguity/not-found/static/coverage tests passed in the full suite.

No contract behavior was found that lacks test coverage relevant to this issue.

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## Recommendations

- Keep the scoped freshness helpers private unless another tool needs them. The current placement avoids prematurely creating a broader graph-report abstraction.
- If future work adds edge evidence files beyond source-node files, extend `inspectEdge` with an explicit evidence-file field rather than overloading `provenance.evidence` parsing.
- Consider adding formatter/linting in a future housekeeping task; there is minor pre-existing indentation inconsistency in `src/tools/symbol-graph.ts:156-162`, but it does not affect behavior and is outside this issue.

## Assessment

ready

The implementation is cohesive, result-scoped, well covered by behavior tests, and preserves the public tool set. Verification already passed `bun test && bun run check` with `437 pass`, `0 fail`, and `tsc --noEmit` success. No code-review findings require changes before merge.