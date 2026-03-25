---
id: 44
type: feature
status: done
closed: 2026-03-23
closing_note: "Implemented. delete_edge tool added in src/tools/delete-edge.ts with full node resolution, disambiguation, agent-only restriction, and confirmation output. Registered in src/index.ts. 8 tests in tool-delete-edge.test.ts cover all paths."
created: 2026-03-23T12:36:03.155Z
priority: 1
---
# Add delete_edge tool to allow agents to retract incorrect edges

## Observed behavior

After testing, the graph contains 12 agent edges including artifacts like:
- `evidence: "bogus"` — test artifact
- `evidence: "self-call"` — self-referential edge
- `computeAnchor -[implements]→ sha256Hex` — semantically nonsensical (function "implements" function)
- `evidence: "Stress test: unusual edge kind between incompatible symbol types"`

These edges now permanently pollute symbol_graph, impact, and trace output. There is no tool to remove them.

## Root cause

`resolve_edge` in `src/tools/resolve-edge.ts` only creates/upserts. The store has `deleteEdge(source, target, kind, provenanceSource)` at `src/graph/sqlite.ts:201-203`, but no tool exposes it.

Agent edges survive re-indexing because `deleteFile` at sqlite.ts:213 explicitly preserves them: `WHERE provenance_source != 'agent'`. This is correct design — agent knowledge shouldn't be lost on re-index — but it requires a compensating deletion mechanism.

## Expected behavior

A `delete_edge` tool registered alongside `resolve_edge` that:
1. Accepts source/target names (+ optional file disambiguation), edge kind
2. Looks up the nodes (same resolution as resolve_edge)
3. Calls `store.deleteEdge()` with provenance_source `"agent"` (only agent edges should be deletable by agents)
4. Returns confirmation with the deleted edge details, or "not found" if no matching agent edge exists

## Files involved

- `src/tools/resolve-edge.ts` — model for the new tool's resolution logic
- `src/graph/sqlite.ts:201-203` — existing `deleteEdge` store method
- `src/index.ts` — tool registration (new tool to add alongside resolve_edge)
