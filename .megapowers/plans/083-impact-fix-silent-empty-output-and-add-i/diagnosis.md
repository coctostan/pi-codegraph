# Diagnosis

## Root Cause

Two distinct, narrowly-located defects in `src/tools/impact.ts`, both confirmed by reading the source and observing the exact branches the reproduction test hits.

### RC-1 (issue #073) — empty-hits branch in `impact()` emits `""`

`src/tools/impact.ts:183`:

```
183:1a5|  if (hits.length === 0) return prependTrustHeader("", { stats });
```

When `collectImpactDetails` returns `[]`, the top-level tool hands an empty body string to `prependTrustHeader`. The trust header always renders (`## Trust\nstatus: fresh\n...`), but the body that follows is literally `""`, so the agent sees header-only output with no indication of *why* there were no hits. This is exactly the `"## Trust\nstatus: fresh\nevidence: lsp,tree-sitter  stale-files: 0/0\n"` captured in the reproduction.

Nothing upstream distinguishes the three possible reasons for `hits.length === 0`:
- entry-point (seed `fanIn === 0`),
- interface / type-only seed (seed never has inbound `calls`; may have inbound `implements`),
- genuinely isolated leaf utility.

The information needed to distinguish them is already available at this callsite:
- `params.store.getNode(<seedId>)` gives the `kind` (`"interface"` vs `"function"` vs `"class"` etc.) — see `src/graph/types.ts:1` (`NodeKind`).
- `signalComputer.compute(<seedId>, [])` returns `NodeSignals.fanIn` and `roles` including `"entry-point"` — see `src/output/signals.ts:137` and `:144`.

### RC-2 (issue #074) — BFS hard-codes `kind: "calls"`; `implements` edges never traversed

`src/tools/impact.ts:89`:

```
89:fe3|    const inbound = dedupeInboundByStrongestEdge(store.getNeighbors(current.id, { direction: "in", kind: "calls" }));
```

The BFS only asks for inbound `calls` edges. The `implements` edges produced by the LSP indexer (`src/indexer/lsp-resolver.ts:162` and `:213`, both writing `kind: "implements"`) are never read by `collectImpactDetails`. Consequently:

- Seeds that are interfaces (their inbound edges are almost exclusively `implements`) get zero neighbors and yield `[]`.
- Classes that implement a changed interface are not flagged as breaking dependents, and their callers are not discovered transitively.

The underlying graph fully supports the required query. `NeighborOptions.kind` accepts any `EdgeKind` (`src/graph/store.ts:4` + `src/graph/types.ts:9-17` — `"implements"` is a valid value), and `SqliteGraphStore.fetchNeighborRows` (`src/graph/sqlite.ts:167-178`) translates the `kind` into a `WHERE e.kind = ?` clause. Reproduction test `BUG #074` inserts an `implements` edge and `collectImpact` still returns `[]`, so the failure is specifically inside `collectImpactDetails`, not the store.

## Trace

### For #073 (empty output)

```
test input: impact({ symbols: ["entryPoint"], changeType: "signature_change", store, projectRoot, maxDepth: 5 })
  └─ src/tools/impact.ts:131 impact()
       ├─ store.getStatistics(...) → stats (OK)
       ├─ symbols present / valid changeType (OK)
       ├─ resolveUniqueSymbol("entryPoint") → resolved.kind = "ok" (node exists; OK)
       ├─ changeType !== "addition"          (OK — skip the addition guard)
       ├─ hits = collectImpactDetails({ symbols:["entryPoint"], ... })
       │     └─ BFS starts at entryPoint, inbound calls = [] → detailsByNode empty → return []
       └─ hits.length === 0  ← line 183, returns prependTrustHeader("", { stats })
              Result: "## Trust\nstatus: fresh\nevidence: lsp,tree-sitter  stale-files: 0/0\n"
              (No body. No diagnostic. No mention of "entryPoint".)
```

Same terminal branch fires for `impact(["Store"], "removal")` — different reason for empty hits (interface, inbound is `implements` not `calls`), same silent output.

### For #074 (implements not traversed)

```
test input: collectImpact({ symbols:["Store"], changeType:"signature_change", store, maxDepth:5 })
  └─ src/tools/impact.ts:121 collectImpact()
       └─ collectImpactDetails(...)
            ├─ changeType !== "addition" (OK)
            ├─ seed queue: [{ id: "src/iface.ts::Store:1", depth:0 }]
            └─ while loop (line 85)
                 current = Store, depth 0
                 inbound = store.getNeighbors(Store, { direction:"in", kind:"calls" })  ← line 89
                   SQL: SELECT ... FROM edges e ... WHERE e.target = 'src/iface.ts::Store:1' AND e.kind = 'calls'
                   rows = []   ← the only inbound edge in the store is { kind:"implements", source:MyStore, target:Store }
                 for-loop body never runs.
                 queue empties.
            └─ return []
```

`MyStore` (implements Store) and `useStore` (calls MyStore) are therefore never enqueued. This matches the `---IMPLEMENTS-HITS--- []` observation.

## Affected Code

Primary — `src/tools/impact.ts`:

- `collectImpactDetails()` lines `66-119` — BFS body; the `kind: "calls"` hardcode is line `89`.
- `impact()` lines `131-197` — string-building tool entry; the silent empty-hits branch is line `183`.
- Signatures to preserve (both are exported and called from tests and `extension-impact.test.ts`):
  - `export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[]` (line 66)
  - `export function collectImpact(params: CollectImpactParams): ImpactItem[]` (line 121)
  - `export function impact(params: { symbols: string[]; changeType: ChangeType; store: GraphStore; projectRoot: string; maxDepth?: number }): string` (line 131)

Supporting — read-only:

- `src/graph/types.ts:9-17` — `EdgeKind` includes `"implements"`, `"extends"`, `"tested_by"`, etc.
- `src/graph/store.ts:3-6` — `NeighborOptions { kind?: EdgeKind; direction?: "in"|"out"|"both" }`.
- `src/graph/sqlite.ts:148-178` — `getNeighbors` / `fetchNeighborRows` already support filtering by any `kind`; no store changes needed.
- `src/indexer/lsp-resolver.ts:157-213` — writes `implements` edges with provenance `source: "lsp"`.
- `src/output/signals.ts:120-168` — `SignalComputer.compute` exposes `fanIn` and `roles` (including `"entry-point"`), which the #073 fix can reuse for seed diagnostics.

Test artifacts in play:

- `test/tool-impact-083-repro.test.ts` — three failing cases (2 for #073, 1 for #074).
- `test/tool-impact.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/extension-impact.test.ts`, etc. — all currently passing with calls-only traversal; must continue to pass.

## Pattern Analysis

### Working example for the #073 fix — `addition` diagnostic

`src/tools/impact.ts:168-173` already handles the "no impact is expected" case with an explicit diagnostic string:

```
168: if (params.changeType === "addition") {
169:   return prependTrustHeader(
170:     `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood\n`,
171:     { stats },
172:   );
173: }
```

Differences between that working path and the broken line 183:
- Working path emits a full sentence explaining why the result is empty, ending with `\n`.
- Working path *does not* attempt to classify the seed; it is a blanket message keyed on `changeType`.
- Broken path emits `""`; the trust header then renders alone.

The #073 fix must mirror the `addition` path's shape (string through `prependTrustHeader`) while branching on seed node kind / fanIn to produce one of three messages prescribed by the issue.

### Working example for the #074 fix — multi-kind neighbor fan-out in `signals.ts`

`src/output/signals.ts:103-106` already demonstrates running two `getNeighbors` queries with different `kind` values and merging them:

```
const edges = [
  ...store.getNeighbors(nodeModule.id, { direction: "out", kind: "co_changes_with" }),
  ...store.getNeighbors(nodeModule.id, { direction: "in", kind: "co_changes_with" }),
];
```

And `src/indexer/lsp-resolver.ts:175` specifically reads inbound `implements` via `store.getNeighbors(node.id, { direction: "in", kind: "implements" })`. The store contract is proven, so the #074 fix is a one-line additional `getNeighbors({ direction: "in", kind: "implements" })` before the existing `calls` fetch, merged and deduped (the existing `dedupeInboundByStrongestEdge` already keys by `node.id` and keeps the highest-confidence edge — duplicates across kinds collapse cleanly).

### Assumptions violated

- `collectImpactDetails` assumes "inbound calls" = "all inbound dependency evidence". False — `implements` and (for completeness) `extends` also create breaking dependencies when an interface/base type changes signature.
- `impact` assumes "hits is empty" = "nothing worth saying". False — the agent needs to know whether the symbol is an entry point, an interface (consult symbol_graph for implementors), or genuinely leaf.

## Risk Assessment

Blast radius of the planned changes (computed by reading callers in the repo):

- `collectImpactDetails` is exported and used by `collectImpact` (same file, line 121) and by the reproduction test. `collectImpact` in turn feeds `test/tool-impact.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-performance.test.ts`. No external consumers outside `src/tools/impact.ts` and tests. Adding new hits (implements expansion) could:
  - Change result *ordering* in ranking tests. Mitigation: existing `compareDetails` stable sort is deterministic; the new implementors will be at depth 1 with classification `breaking`, which sorts at the top — ranking tests that assert full lists may need to include them if they use interface seeds; current ranking tests use function seeds without implementors so they should be unaffected. Verification step: run all impact tests after the change.
  - Produce duplicates if a node both `calls` and `implements` a seed. Mitigation: the existing `seen` map keyed on `neighbor.node.id` (lines 94, 100) already blocks same-depth re-enqueues; we must apply the same check when we enqueue `implements` implementors at depth 1. Ensure the dedupe runs *before* writing into `detailsByNode` to avoid two entries for the same nodeId.
  - Slightly increase BFS cost per seed (one extra inbound query per node visited, or just per seed if we only do one-hop expansion at depth 0 as the issue text suggests). Performance test `test/tool-impact-performance.test.ts` should be re-run.

- `impact()` new empty-hits branches are behavior changes that produce non-empty output in cases that currently produce empty output. Test `test/tool-impact-empty-output.test.ts` already requires non-empty diagnostic for "symbol not found" and "addition" — those paths are untouched; the new diagnostic branch fires strictly later (after `hits.length === 0` but before the existing line 183 return). No existing positive test asserts empty output, so nothing will regress from the string getting longer, but any test using `toEqual`/exact-match on impact output for an all-empty case must be audited. Grep for `toEqual(""` and similar in `test/tool-impact*`.

Related bugs potentially sharing root cause:
- `extends` edges are similarly ignored. Issue #074 scope only covers `implements`, so do not silently expand to `extends` in this change — call that out as future work.
- `trace` and `symbol_graph` tools have their own traversal code; not affected by this diagnosis.

## Fixed When

1. `collectImpactDetails` performs a one-hop `implements` inbound expansion for each seed before the calls BFS, enqueuing each implementor at `depth: 1` with chain confidence equal to the `implements` edge confidence, and each resulting implementor enters the same `calls` BFS used today. `classify(changeType, 1)` is used unchanged, so implementors land as `breaking` for `signature_change`/`removal` and `behavioral` for `behavior_change`.
2. When a seed node is itself both the target of an `implements` edge and reachable via `calls` from another seed, the node is not duplicated in the output (existing `seen` map on `neighbor.node.id` covers this; verified by a dedupe test case).
3. `impact()` replaces the bare `return prependTrustHeader("", { stats })` at `src/tools/impact.ts:183` with a diagnostic that distinguishes, per seed:
   - Entry point — chosen when the seed node's `fanIn === 0` (computed via `signalComputer.compute(seedId).fanIn`): `"No dependents found — '<name>' is an entry point with no callers."`.
   - Interface / type-only — chosen when the seed's `kind === "interface"` and no hits were produced even after the implements expansion: `"No call-edge dependents found for interface '<name>'. Consider checking implementors via symbol_graph."`.
   - Genuinely isolated — fallback: `"No dependents found for '<name>' within depth <maxDepth>."`.
4. Multiple-seed input: when the seeds resolve to different categories, the diagnostic reports one line per seed (stable order = input order) so the agent can disambiguate.
5. All three reproduction tests in `test/tool-impact-083-repro.test.ts` pass.
6. Existing tests continue to pass with no structural changes: `test/tool-impact.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/tool-impact-ambiguous.test.ts`, `test/tool-impact-performance.test.ts`, `test/extension-impact.test.ts`.
7. No changes to `GraphStore` / `NeighborOptions` / `EdgeKind` — the fix lives entirely inside `src/tools/impact.ts`.
