# Code Review — 022-m1-resolve-edge-tool-pi-extension-wiring

## Summary

All 12 tasks complete. 59 tests pass, 0 fail.

## Files Changed

| File | Change |
|------|--------|
| `src/tools/symbol-graph.ts` | Added `isAgentEdgeStale()` + passed `store` through `buildSection`/`toAnchoredNeighbor` |
| `src/index.ts` | Full pi extension wiring: TypeBox schemas, singleton store, auto-indexing, real tool execution |
| `test/tool-symbol-graph-stale-agent.test.ts` | Stale agent edge detection tests |
| `test/extension-wiring.test.ts` | Schema registration tests for both tools |
| `test/extension-auto-index.test.ts` | Singleton store and auto-index integration tests |

## Review

### src/tools/symbol-graph.ts

- `isAgentEdgeStale` correctly checks: only `source === "agent"` edges, then compares `edge.provenance.content_hash` vs `store.getFileHash(sourceNode.file)`. Returns `true` (stale) if no file hash found — conservative and correct.
- Spread `{ ...anchor, stale: true }` is fine since `AnchorResult` only has `{ anchor: string, stale: boolean }`.
- No changes to non-agent edges — existing staleness detection (file content hash vs node content hash) is preserved.

### src/index.ts

- Singleton `sharedStore` at module scope — correct for production (one DB per process), exported test helpers (`resetStoreForTesting`, `getSharedStoreForTesting`) for test isolation.
- `getOrCreateStore` opens SQLite at `<cwd>/.codegraph/graph.db` on first call and caches it.
- `ensureIndexed` only calls `indexProject` when `store.listFiles().length === 0` — idempotent guard.
- Both tools share the same store, satisfying the singleton requirement.
- TypeBox schemas use `@sinclair/typebox` directly (available as transitive dep via `@mariozechner/pi-coding-agent`). Schema required/optional fields match spec exactly.

## No Issues Found

Code is correct, minimal, and well-tested. Ready to ship.
