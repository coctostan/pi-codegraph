# Bugfix: Deduplicate self-referential edges in symbol_graph output

## Problem
`symbol_graph("SqliteGraphStore")` displayed duplicate caller entries for self-referential edges — the same node appeared twice in the Callers section with identical confidence and provenance.

## Root Cause
`SqliteGraphStore.getNeighbors()` with direction `"both"` concatenated results from two SQL queries (outgoing + incoming). For self-referential edges (`source === target`), both queries matched the same row, producing two identical `NeighborResult` entries. No deduplication existed at either the store or tool layer.

## Fix
Added deduplication in the `"both"` path of `getNeighbors()` using a `Set` keyed by the edge's composite primary key `(source, target, kind, provenance_source)`. This matches the database's `PRIMARY KEY` constraint, so only true duplicates are collapsed — edges with different provenance sources between the same nodes are preserved.

## Files Changed
- `src/graph/sqlite.ts` — `getNeighbors()` method: replaced naive array concatenation with dedup loop
- `test/repro-039-self-referential-dedup.test.ts` — regression tests (store-layer + tool-layer)

## Verification
- `getNeighbors(nodeId)` returns exactly 1 entry for a self-referential edge with `"both"` direction
- `symbolGraph` output shows at most 1 line per unique neighbor relationship
- Full test suite: 246 pass, 0 fail
