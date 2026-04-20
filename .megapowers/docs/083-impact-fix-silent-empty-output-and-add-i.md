# Bugfix: impact — silent empty output and missing implements traversal

**Issues fixed:** #073, #074  
**File changed:** `src/tools/impact.ts` (production only; no graph/store changes)

---

## Root Cause

Two independent defects in `src/tools/impact.ts`:

### RC-1 (#073) — empty-hits branch emitted `""`

At `impact()` line 213 (post-fix numbering), when `collectImpactDetails` returned `[]`, the function called:

```ts
return prependTrustHeader("", { stats });
```

This produced output consisting only of the trust header — no body, no explanation. An agent receiving this had no way to distinguish "symbol doesn't exist", "no callers", "interface with no inbound calls", or "genuinely isolated utility".

### RC-2 (#074) — BFS hard-coded `kind: "calls"`, ignoring `implements` edges

At `collectImpactDetails` line 89, the BFS fetched only inbound `calls` neighbors:

```ts
const inbound = dedupeInboundByStrongestEdge(
  store.getNeighbors(current.id, { direction: "in", kind: "calls" })
);
```

LSP-indexed `implements` edges (written by `src/indexer/lsp-resolver.ts`) were never read, so:
- Interface seeds always returned `[]` (their only inbound edges are `implements`)
- Classes that implement a changed interface were never flagged as breaking dependents

---

## Fix

**Both fixes are contained entirely in `src/tools/impact.ts`. No graph, store, or type-definition files were modified.**

### Fix for #074 — merge inbound `calls` and `implements` in BFS

In `collectImpactDetails`, replaced the single-kind fetch with a two-query merge:

```ts
const inboundCalls = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
const inbound = dedupeInboundByStrongestEdge([...inboundCalls, ...inboundImplements]);
```

The existing `dedupeInboundByStrongestEdge` already collapses duplicates by `node.id`, handling nodes that appear in both lists (e.g. a class that both implements and calls the same interface). Classification flows through the same `classify(changeType, depth)` call, so implementors at `depth: 1` correctly land as `breaking` for `signature_change`/`removal` and `behavioral` for `behavior_change`.

### Fix for #073 — per-seed diagnostic when hits is empty

Added `buildEmptyImpactDiagnostic()` (private helper, same file) that classifies each seed:

```ts
// src/tools/impact.ts — collectImpactDetails, impact
export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[]
export function collectImpact(params: CollectImpactParams): ImpactItem[]
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string
```

When `hits.length === 0`, `impact()` now calls the helper:

```ts
if (hits.length === 0) {
  const body = buildEmptyImpactDiagnostic(params.symbols, params.store, signalComputer, params.maxDepth ?? 5);
  return prependTrustHeader(body, { stats });
}
```

The helper emits one line per seed, in input order, selecting the message based on:

| Condition | Message |
|---|---|
| `node.kind === "interface"` | `No call-edge dependents found for interface '<name>'. Consider checking implementors via symbol_graph.` |
| `signals.roles.includes("entry-point")` | `No dependents found — '<name>' is an entry point with no callers.` |
| fallback | `No dependents found for '<name>' within depth <maxDepth>.` |

The ordering — interface check before entry-point check — ensures interfaces with no inbound `implements` (rare, but valid) don't get misreported as entry-points. The `entry-point` role requires `isExported && kind !== "module" && fanIn === 0`, preventing unexported leaf utilities from appearing as entry points.

**Important interaction with #074 fix:** because the BFS now also traverses `implements` edges, an interface *with* implementors produces a non-empty `hits` array and never reaches the `buildEmptyImpactDiagnostic` branch. The "interface" diagnostic message therefore fires only when the interface genuinely has no dependents even after the implements expansion.

---

## Files Changed

| File | Change |
|---|---|
| `src/tools/impact.ts` | Added `inboundImplements` merge in `collectImpactDetails`; added `buildEmptyImpactDiagnostic` helper; replaced bare `return prependTrustHeader("", ...)` with diagnostic branch in `impact()` |
| `test/tool-impact-implements-edges.test.ts` | New — regression tests for #074: all 3 change types, dedup |
| `test/tool-impact-empty-diagnostic.test.ts` | New — regression tests for #073: entry-point, interface, isolated, multi-seed stable order |
| `test/tool-impact-083-repro.test.ts` | Updated — tightened loose reproduce-phase assertions to full post-fix contract; added `is_exported: true` to fixture nodes; removed console.log instrumentation |

---

## Verification

Full suite: `385 pass, 0 fail` (157 files).

Key targeted suites:
- `test/tool-impact-implements-edges.test.ts`: 2 pass
- `test/tool-impact-empty-diagnostic.test.ts`: 4 pass
- `test/tool-impact-083-repro.test.ts`: 3 pass
- All pre-existing impact suites: pass (trust-header, ranking, output-signals, performance, ambiguous, empty-output, extension-impact)

Raw reproduction confirms both original symptoms are gone:
- Entry-point: output now contains `No dependents found — 'entryPoint' is an entry point with no callers.` instead of header-only
- Interface: `collectImpact(["Store"])` now returns `[MyStore (breaking, depth:1), useStore (behavioral, depth:2)]` instead of `[]`
