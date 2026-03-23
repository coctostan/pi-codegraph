# Diagnosis

## Root Cause

Three missing input validation guards in the tool layer:

### Bug 1: `rankNeighbors` negative limit
**Root cause:** `src/output/anchoring.ts:63` — `sorted.slice(0, limit)` passes a negative number to `Array.slice()`. JavaScript's `slice(0, -1)` returns all elements except the last one, not "all elements" or "none". There is no guard on the `limit` parameter before it reaches `slice()`.

**Trace:** `symbolGraph()` (line 69: `limit = 10` default) → `buildSection()` (line 55) → `rankNeighbors(neighbors, limit)` (line 63: `sorted.slice(0, limit)`). The default of 10 in `symbolGraph` is only applied when `limit` is `undefined`. If a caller explicitly passes `limit: -1`, it flows through unchecked. Currently the pi tool schema in `src/index.ts` doesn't expose `limit` as a tool parameter, but the function API accepts it and tests/direct callers can pass any value.

**Working pattern comparison:** `src/tools/graph-query-parser.ts:256` validates `limit <= 0` and throws: `"LIMIT must be a positive integer"`. The `rankNeighbors` function lacks an equivalent guard.

### Bug 2: Self-referential edges
**Root cause:** `src/tools/resolve-edge.ts:64-76` — after resolving `sourceNode` and `targetNode`, there is no check that `sourceNode.id !== targetNode.id` before calling `store.addEdge()`. When `source === target` (same symbol name) and they resolve to the same node, the edge creates a self-loop.

**Downstream impact:** In `src/tools/symbol-graph.ts:97-112`, `store.getNeighbors(node.id)` returns the self-referential edge. The classification loop at line 104 checks `nr.edge.target === node.id` (true → callers) and the else branch catches outbound edges (true → callees). The node appears in **both** callers and callees lists, polluting the graph output.

**Existing validation pattern:** `resolveEdge` already validates edge kind (line 62: `isValidEdgeKind`), source/target existence (lines 44-57), and ambiguous matches (lines 47-57). Self-reference is simply missing from the validation chain.

### Bug 3: Empty/whitespace evidence
**Root cause:** `src/tools/resolve-edge.ts:76` — evidence is passed directly into `provenance: { ..., evidence, ... }` without any check. Empty string `""` and whitespace-only `"   "` are silently accepted. The `evidence` field is the only audit trail for agent-written edges (confidence is hardcoded at 0.7), so an empty value undermines the graph's provenance model.

**No existing validation:** Unlike edge kind which has `isValidEdgeKind()`, evidence has no validation function.

## Trace

```
Bug 1:
  symbolGraph({ limit: -1 })
  → buildSection(callerResults, -1, ...)        // symbol-graph.ts:114
  → rankNeighbors(neighbors, -1)                // anchoring.ts:55
  → sorted.slice(0, -1)                         // anchoring.ts:63 — JS slice semantics: drops last element
  → kept.length = n-1, omitted = 1              // wrong: should be n or default

Bug 2:
  resolveEdge({ source: "foo", target: "foo" })
  → sourceNodes = store.findNodes("foo")         // resolve-edge.ts:43
  → targetNodes = store.findNodes("foo")         // resolve-edge.ts:50
  → sourceNode.id === targetNode.id              // NO CHECK — proceeds to addEdge
  → store.addEdge({ source: id, target: id })    // resolve-edge.ts:73 — self-loop created

Bug 3:
  resolveEdge({ evidence: "" })
  → evidence = ""                                // resolve-edge.ts:41
  → NO CHECK on evidence value
  → store.addEdge({ provenance: { evidence: "" } })  // resolve-edge.ts:76
```

## Affected Code

| File | Lines | Function | Issue |
|------|-------|----------|-------|
| `src/output/anchoring.ts` | 55-69 | `rankNeighbors` | No guard for `limit < 1` |
| `src/tools/resolve-edge.ts` | 64-76 | `resolveEdge` | No self-reference check, no evidence validation |
| `src/tools/symbol-graph.ts` | 97-112 | `symbolGraph` | Victim of self-referential edges (shows node as both caller and callee) |

## Pattern Analysis

**Working:** `graph-query-parser.ts:256` — `if (limit !== undefined && limit <= 0) throw new GraphQueryError("parse_error", "LIMIT must be a positive integer");`

**Broken:** `anchoring.ts:63` — `sorted.slice(0, limit)` with no guard.

**Working:** `resolve-edge.ts:58-62` — validates edge kind with `isValidEdgeKind(kind)`, returns error string if invalid.

**Broken:** `resolve-edge.ts:64-76` — no `sourceNode.id === targetNode.id` check, no `evidence.trim()` check.

The validation pattern in `resolveEdge` is: check condition → return error string. The fix should follow this same pattern rather than throwing.

## Risk Assessment

- **`rankNeighbors`:** Only called from `buildSection` in `symbol-graph.ts`. Currently the tool schema doesn't expose `limit`, so only programmatic callers are affected. Low blast radius, but the function should be defensive.
- **`resolveEdge`:** Called from `src/index.ts:163` (tool handler) and tests. Adding validation before `addEdge` has zero risk to existing valid usage — it only rejects currently-invalid inputs.
- **`symbolGraph`:** Not modified — it's a downstream victim of bug 2. Fixing `resolveEdge` prevents the bad data from entering.
- **No shared root cause** — these are three independent missing guards in different locations.

## Fixed When

1. `rankNeighbors(neighbors, -1)` treats negative limit as default (10), returning all neighbors when count ≤ 10
2. `rankNeighbors(neighbors, 0)` continues to return 0 items (existing correct behavior preserved)
3. `resolveEdge({ source: "foo", target: "foo" })` returns an error string containing "same node" or similar rejection
4. `resolveEdge({ evidence: "" })` returns an error string about empty evidence
5. `resolveEdge({ evidence: "   " })` returns an error string about empty evidence (whitespace-only)
6. All existing tests continue to pass
