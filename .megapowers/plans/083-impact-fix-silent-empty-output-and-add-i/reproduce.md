# Reproduction: `impact` returns silent empty output and ignores `implements` edges

Batch issue #083 combines two bugs in `src/tools/impact.ts`:

- **#073** — `impact(...)` returns a body of `""` (trust header only, no diagnostic) whenever `collectImpactDetails` returns `[]` (entry points, interfaces, isolated leaves).
- **#074** — `collectImpactDetails` only traverses inbound `calls` edges, so changes to interfaces have no traceable blast radius even though `implements` edges exist in the graph.

## Steps to Reproduce

Run the newly added regression test file that exercises both paths:

```
bun test test/tool-impact-083-repro.test.ts
```

The test wires up a small in-memory graph:

- `entryPoint` — a function with **zero inbound edges** (simulates an entry point).
- `Store` (interface) ← `implements` ← `MyStore` (class) ← `calls` ← `useStore` (function).

Three assertions:

1. `impact({ symbols: ["entryPoint"], changeType: "signature_change" })` returns a non-empty body mentioning the symbol.
2. `impact({ symbols: ["Store"], changeType: "removal" })` returns a non-empty body distinguishing the interface case.
3. `collectImpact({ symbols: ["Store"], changeType: "signature_change" })` includes `MyStore` (depth 1, breaking) and `useStore` (depth 2).

All three fail on `main` (commit `8bebf0ca`).

## Expected Behavior

- **#073** — When `collectImpactDetails` returns `[]`, `impact` should emit a diagnostic that differentiates:
  - Entry point (`fan-in === 0`) → `"No dependents found — 'entryPoint' is an entry point with no callers."`
  - Interface / type-only node → `"No call-edge dependents found for interface 'Store'. Consider checking implementors via symbol_graph."`
  - Genuinely isolated → `"No dependents found for 'X' within depth N."`
- **#074** — For `signature_change` / `removal` / `behavior_change`, `collectImpactDetails` should perform a one-hop `implements` expansion before the BFS so that `MyStore` appears at depth 1 (`breaking`), `useStore` at depth 2 (`behavioral`).

## Actual Behavior

Captured from the test run (`bun test test/tool-impact-083-repro.test.ts`):

```
---ENTRY-POINT-OUTPUT-START---
"## Trust\nstatus: fresh\nevidence: lsp,tree-sitter  stale-files: 0/0\n"
---ENTRY-POINT-OUTPUT-END---
```

```
---INTERFACE-OUTPUT-START---
"## Trust\nstatus: fresh\nevidence: lsp,tree-sitter  stale-files: 0/0\n"
---INTERFACE-OUTPUT-END---
```

```
---IMPLEMENTS-HITS---
[]
---END---
```

Output body after the trust header is an empty string for both #073 scenarios. `collectImpact` returns `[]` for #074 even though the `implements` + `calls` edges exist in the store.

## Evidence

Bug #073 — `src/tools/impact.ts:183`:

```
183:1a5|  if (hits.length === 0) return prependTrustHeader("", { stats });
```

The empty-body early-return is what produces the silent trust-header-only output.

Bug #074 — `src/tools/impact.ts:89`:

```
89:fe3|    const inbound = dedupeInboundByStrongestEdge(store.getNeighbors(current.id, { direction: "in", kind: "calls" }));
```

Traversal hard-codes `kind: "calls"`. The store supports `kind: "implements"` (`src/graph/types.ts:9` — `EdgeKind` includes `implements`, `extends`, etc.) and the LSP indexer writes `implements` edges (`src/indexer/lsp-resolver.ts:162`, `:213`), but `collectImpactDetails` never reads them.

Signatures referenced from the real source:

```
66:b96|export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
131:e1c|export function impact(params: { symbols: string[]; changeType: ChangeType; store: GraphStore; projectRoot: string; maxDepth?: number }): string
```

Raw test-run transcript:

```
bun test v1.3.11 (af24e281)

test/tool-impact-083-repro.test.ts:
(fail) BUG #073: impact on an entry-point symbol returns silent empty body (no diagnostic) [6.67ms]
(fail) BUG #073: impact on an interface (no calls inbound) returns silent empty body [2.23ms]
(fail) BUG #074: impact on an interface does not traverse implements edges [1.78ms]

 0 pass
 3 fail
 3 expect() calls
```

## Environment

- Runtime: Bun 1.3.11 (`af24e281`)
- Project: `pi-codegraph` @ commit `8bebf0ca` (`fix: validate impact input guards (#44)`)
- Test framework: `bun:test`
- No external services or network required — reproduction uses an in-memory `SqliteGraphStore` with hand-written nodes/edges.

## Failing Test

File: `test/tool-impact-083-repro.test.ts`

Three failing cases (all in this file):

1. `BUG #073: impact on an entry-point symbol returns silent empty body (no diagnostic)` — fails because the body after the trust header is `""`, no mention of `entryPoint` or "entry point".
2. `BUG #073: impact on an interface (no calls inbound) returns silent empty body` — fails because the body after the trust header is `""`, no mention of `Store` / interface / implementors.
3. `BUG #074: impact on an interface does not traverse implements edges` — fails because `collectImpact` returns `[]` instead of including `MyStore` (depth 1, breaking) and `useStore` (depth 2).

The test exercises both public surfaces (`impact` string output for #073, `collectImpact` structured output for #074) so fixes can target either layer without restructuring the test.

## Reproducibility

Always. Deterministic — the test builds the graph in-process, does not depend on indexing, coverage, filesystem scans, timing, or ordering.
