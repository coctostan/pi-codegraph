# Reproduction: Tool input validation gaps — negative limit, self-referential edges, empty evidence

## Steps to Reproduce

### Bug 1: `rankNeighbors` with negative limit
1. Call `rankNeighbors(neighbors, -1)` where `neighbors` has 5 items
2. Observe `kept.length === 4` and `omitted === 1`

### Bug 2: Self-referential edges accepted
1. Create a store with node `foo` at `src/a.ts::foo:1`
2. Call `resolveEdge({ source: "foo", target: "foo", kind: "calls", evidence: "test", ... })`
3. Observe edge is created (source === target)

### Bug 3: Empty/whitespace evidence accepted
1. Create a store with nodes `foo` and `bar`
2. Call `resolveEdge({ ..., evidence: "" })` or `resolveEdge({ ..., evidence: "   " })`
3. Observe edge is created with empty evidence

## Expected Behavior

1. `rankNeighbors` with `limit < 1` should treat it as default (10), returning all 5 items since 5 < 10
2. `resolveEdge` should reject edges where source and target resolve to the same node ID
3. `resolveEdge` should reject edges with empty or whitespace-only evidence

## Actual Behavior

1. `rankNeighbors(-1)`: `Array.slice(0, -1)` drops the last element → returns 4 of 5, `omitted: 1`
2. Self-referential edge: `"Edge created:\n  source: src/a.ts:1:?  foo\n  target: src/a.ts:1:?  foo\n  kind: calls\n  provenance: agent  confidence:0.7"`
3. Empty evidence: `"Edge created:\n  source: src/a.ts:1:?  foo\n  target: src/a.ts:10:?  bar\n  kind: calls\n  provenance: agent  confidence:0.7"`

## Evidence

Full test output from `bun test test/repro-037-validation-gaps.test.ts`:

```
Bug 1 — limit=-1: kept=4, omitted=1
  → slice(0, -1) cuts last element. No guard for negative values.

Bug 2 — Self-referential edge result: Edge created:
  source: src/a.ts:1:?  foo
  target: src/a.ts:1:?  foo
  kind: calls
  provenance: agent  confidence:0.7
  → No check that sourceNode.id !== targetNode.id

Bug 3 — Empty evidence result: Edge created:
  source: src/a.ts:1:?  foo
  target: src/a.ts:10:?  bar
  kind: calls
  provenance: agent  confidence:0.7
  → No check that evidence is non-empty after trim
```

### Root cause locations:
- Bug 1: `src/output/anchoring.ts:63` — `sorted.slice(0, limit)` with no guard for negative limit
- Bug 2: `src/tools/resolve-edge.ts:71-76` — no check that `sourceNode.id !== targetNode.id`
- Bug 3: `src/tools/resolve-edge.ts:41-76` — no check that `evidence.trim().length > 0`

## Environment
- Bun 1.3.11
- macOS
- pi-codegraph project

## Failing Test
`test/repro-037-validation-gaps.test.ts` — 4 failing tests, 1 passing (limit=0 as baseline).

## Reproducibility
Always — all three bugs reproduce 100% of the time.
