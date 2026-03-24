---
id: 49
type: feature
status: in-progress
created: 2026-03-24T02:55:36.955Z
sources: [48]
priority: 1
---
# symbol_card tool: compact symbol summary for agent consumption
## Goal

Add a `symbol_card` tool that returns a compact, structured summary of a symbol — definition, type signature, covering tests, and key relationships — in a single call. This is the "glanceable fact sheet" an agent needs before deciding what to read or change.

## Motivation

Currently an agent must call `symbol_graph` (neighborhood), `trace` (execution path), and `impact` (change analysis) separately and mentally combine them. `symbol_card` gives the 80% answer in one call: what is this thing, what's its contract surface, what tests cover it, and what are the most important connections.

## Scope

### Output format
Given `symbol_card({ name: "deleteEdge" })`, return something like:

```
## deleteEdge (function)
src/tools/delete-edge.ts:39:abc1

### Signature
(params: DeleteEdgeParams) => string

### Exported: yes

### Covering Tests (2)
  test/tool-delete-edge.test.ts:5:def2  "deleteEdge deletes an existing agent edge..."
  test/tool-delete-edge.test.ts:12:ghi3  "deleteEdge returns error when source..."

### Key Relationships
  Callers (1):  piCodegraph (src/index.ts:184)
  Callees (3):  store.findNodes, store.deleteEdge, computeAnchor
  Imports (2):  ../graph/store.js, ../output/anchoring.js

### Signals
  [hub] [tested]
```

### Data sources (all existing)
- `store.findNodes()` → definition anchor
- `store.getNeighbors()` → callers, callees, imports
- `tested_by` edges → covering tests
- Node `signature` field (from #048) → type signature
- `is_exported` flag → export status
- Signal computer → hub/tested/bottleneck badges

### Tool registration
- New file: `src/tools/symbol-card.ts`
- Register in `src/index.ts` with params: `{ name: string, file?: string }`
- Same disambiguation pattern as `symbol_graph`

### What NOT to do
- No invariant/contract inference (that's `symbol_contract`, a later issue)
- No doc comment extraction yet
- Don't duplicate `symbol_graph` rendering — `symbol_card` is a tighter, flatter format

## Dependencies
- #048 (type signature extraction) — for the Signature section. Can stub as "signature not available" if #048 isn't done yet.

## Files involved
- `src/tools/symbol-card.ts` (new)
- `src/index.ts` — register tool
- `src/output/anchoring.ts` — may reuse helpers

## Exit criteria
- `symbol_card({ name: "symbolGraph" })` returns a compact card with definition, signature, tests, and key relationships
- Ambiguous symbols get the same disambiguation treatment as `symbol_graph`
- Anchors are hashline-anchored to current file content
- Trust header is present
- Tests cover: happy path, ambiguous symbol, not-found, symbol with no tests, symbol with no signature
