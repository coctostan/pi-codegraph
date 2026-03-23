# Bugfix Summary: Tool Input Validation Gaps (#037)

## Root Cause

Three independent missing input validation guards in the tool layer:

1. **`rankNeighbors` negative limit** — `Array.slice(0, -1)` silently drops the last neighbor instead of treating negative values as "use default". JS `slice` with negative indices counts from the end.

2. **`resolveEdge` self-referential edges** — No check that `sourceNode.id !== targetNode.id` before `store.addEdge()`. A self-loop causes the node to appear as both caller and callee in `symbol_graph` output.

3. **`resolveEdge` empty evidence** — Empty string `""` and whitespace-only `"   "` accepted as evidence, undermining the provenance audit trail for agent-written edges.

## Fix Approach

All three fixes are minimal validation guards following existing patterns in the codebase:

- **`src/output/anchoring.ts`** — Added `const DEFAULT_NEIGHBOR_LIMIT = 10` and `limit < 0 ? DEFAULT_NEIGHBOR_LIMIT : limit` guard before `slice()`. Preserves `limit=0` behavior.

- **`src/tools/resolve-edge.ts`** — Added two early-return guards:
  - `evidence.trim().length === 0` → returns error string about missing evidence
  - `sourceNode.id === targetNode.id` → returns error string about same-node rejection

## Files Changed

| File | Change |
|------|--------|
| `src/output/anchoring.ts` | Negative limit guard in `rankNeighbors` |
| `src/tools/resolve-edge.ts` | Self-reference check + empty evidence check in `resolveEdge` |
| `test/repro-037-validation-gaps.test.ts` | 3 tests for negative limit behavior |
| `test/tool-resolve-edge-self-ref.test.ts` | 2 tests for self-referential edge rejection |
| `test/tool-resolve-edge-empty-evidence.test.ts` | 3 tests for empty/whitespace evidence rejection |

## How to Verify

```bash
bun test test/repro-037-validation-gaps.test.ts test/tool-resolve-edge-self-ref.test.ts test/tool-resolve-edge-empty-evidence.test.ts
```

All 8 regression tests should pass. Full suite: `bun test` → 241 pass, 0 fail.
