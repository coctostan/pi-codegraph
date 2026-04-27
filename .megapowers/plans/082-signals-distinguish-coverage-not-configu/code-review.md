# Code Review — 082-signals-distinguish-coverage-not-configu

## Files Reviewed

Production code:
- `src/graph/store.ts` — `GraphStore` interface gains `hasCoverageData()` and `markCoverageIndexed()`.
- `src/graph/sqlite.ts` — adds `graph_metadata (key, value)` table; implements both new methods; `hasCoverageData()` is now defensive against legacy DBs (fix applied during this review).
- `src/indexer/coverage.ts` — `runCoverageIndexStage` calls `store.markCoverageIndexed()` at the end, swallowing read-only failures.
- `src/output/signals.ts` — `NodeSignals` gains `coverageKnown`; `createSignalComputer` reads it from the store once at construction; `formatRoleTags`/`formatImpactWhy` switch coverage tag on a 3-state ladder (`tested` → `untested` → `coverage-unknown`/`unknown`).

Test code:
- New: `test/graph-store-coverage-metadata.test.ts`, `test/indexer-coverage-stage-mark-indexed.test.ts`, `test/output-signals-format-coverage-unknown.test.ts`, `test/output-signals-coverage-known.test.ts`, `test/output-signals-impact-why-coverage-unknown.test.ts`, `test/signals-coverage-unknown-fresh-index.test.ts`, `test/graph-store-coverage-metadata-legacy-db.test.ts` (added in this review).
- Updated: `test/graph-types.typecheck.ts`, `test/output-signals.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-symbol-graph-signals.test.ts`, `test/tool-trace-signals.test.ts`, `test/extension-readonly-trust-gating.test.ts` (each adds `markCoverageIndexed()` so they stay on the `untested` branch they originally asserted).

## Strengths

- **Single source of truth for coverage state.** The flag lives in one new SQLite row (`graph_metadata.coverage_indexed = "1"`), set by exactly one writer (`runCoverageIndexStage` at `src/indexer/coverage.ts:198`). No scattered booleans, no parallel files. `markCoverageIndexed()` uses `INSERT OR REPLACE` so it's idempotent (`src/graph/sqlite.ts:342–346`).
- **Conservative semantics for `tested`.** `createSignalComputer` still derives `tested` solely from outgoing `tested_by` edges (`src/output/signals.ts:142`), so a saved test trace alone never upgrades a symbol to `tested`. AC 5's "runtime-only execution must not be treated as `tested`" is preserved cleanly.
- **`coverageKnown` is read once per computer instance** (`src/output/signals.ts:54`). It's hoisted out of the per-node hot path and added to the same `Omit<NodeSignals, "coChangeScore">` cache, so the new field doesn't perturb the existing memoization layout.
- **Coverage tag fallthrough is precedence-correct.** Both `formatRoleTags` and `formatImpactWhy` order checks `tested` → `coverageKnown` → fallback (`src/output/signals.ts:175–179, 190–194`). AC 5 ("`tested` regardless of `coverageKnown`") and AC 6/7 (mutually exclusive `untested` vs `coverage-unknown`) drop straight out of that ordering.
- **Sentinel write is fault-tolerant.** `runCoverageIndexStage` wraps `store.markCoverageIndexed()` in `try/catch` (`src/indexer/coverage.ts:197–201`) so a read-only DB during reindex doesn't take the whole stage down. Aligns with the existing read-only graceful-degradation policy.
- **Tests target real semantics, not just shape.** `test/signals-coverage-unknown-fresh-index.test.ts:38–56` exercises the full `indexProject` path on a project with no coverage reports, confirming the stage-ran-but-found-nothing case correctly emits `untested` (AC 4 + AC 7), while the manually-populated case in the same file pins down AC 6 against a real `SqliteGraphStore`.
- **Persistence test reopens the DB.** `test/graph-store-coverage-metadata.test.ts:21–40` opens, marks, closes, reopens — AC 3 verified end-to-end rather than via in-process state.
- **Compile-time interface drift caught.** `test/graph-types.typecheck.ts:77–78` adds the two new methods to the structural mock, and `tsc --noEmit` would catch any new method added to `GraphStore` against this mock or against `SqliteGraphStore implements GraphStore`.

## Findings

### Critical

None.

### Important

1. **`hasCoverageData()` threw on legacy DBs without `graph_metadata` (FIXED in this review).** 
   - File: `src/graph/sqlite.ts:326–340`.
   - What was wrong: An existing `.codegraph/graph.db` produced before this change has no `graph_metadata` table. Opening it through `SqliteGraphStore` succeeds (the constructor's `CREATE TABLE IF NOT EXISTS` still runs), but on a **read-only mount** the implicit migration is silently a no-op and the table never appears. `hasCoverageData()` then threw `SQLiteError: no such table: graph_metadata`. Because `createSignalComputer` calls `store.hasCoverageData()` eagerly at `src/output/signals.ts:54`, that crash propagates into every signal-rendering tool (`symbol_graph`, `impact`, `trace`, `symbol-card`) — exactly the read-only graceful-degradation path covered by `test/readonly-graceful-degradation.test.ts` and the `lastIndexError = "readonly database"` machinery in `src/index.ts:147`.
   - Why it matters: Production-readiness regression. Users with a previously-indexed `graph.db` on a read-only mount or an older snapshot would lose all signal output until a fresh, writable index is built.
   - How it was fixed: Defensive `try/catch` in `hasCoverageData()` returns `false` (i.e., "coverage state unknown") when the metadata table is unreachable. This matches the spec's intent — without an indexed-coverage signal, the formatter falls back to `coverage-unknown`, which is the correct semantic for "we don't know whether coverage was indexed."
   - Confirmation: New regression test `test/graph-store-coverage-metadata-legacy-db.test.ts` builds a pre-#082 schema with `bun:sqlite` directly, locks both the file (`0o444`) and the directory (`0o555`) to mirror a real read-only mount, then asserts both `hasCoverageData()` and `createSignalComputer(store)` no longer throw. Test failed before the fix, passes after.

   Cited from `codex review --base main` ("[P2] Preserve reads for old read-only databases — src/graph/sqlite.ts:84-87"). I adopted the finding's substance but localized the fix to `hasCoverageData()` rather than to the `CREATE TABLE` site, because the `IF NOT EXISTS` migration at `src/graph/sqlite.ts:84–87` is fine on writable DBs (no actual write happens when the table already exists, and the codex assertion that "this new table creation attempts a schema write … and the constructor throws" is incorrect — I verified the constructor opens cleanly against a legacy DB; the throw was at the read site, not the migration site). Fixing the read tolerates both legacy DBs *and* read-only-mount cases without changing the migration semantics for fresh installs.

### Minor

1. **`markCoverageIndexed()` is unguarded.** `src/graph/sqlite.ts:342–346` does not wrap the `INSERT OR REPLACE` in `try/catch`. The single caller, `runCoverageIndexStage`, wraps the call externally, which is fine; but if any other caller appears later (e.g., a future "force-mark" admin path) the read-only failure path needs to be re-implemented. Not a blocker — the current single call site is correctly defensive — just worth noting that the contract for `markCoverageIndexed()` is "may throw on read-only" and that's not documented at the interface in `src/graph/store.ts:49`.

2. **`formatImpactWhy` uses `unknown`, `formatRoleTags` uses `coverage-unknown`.** Two slightly different surface strings for the same state (`src/output/signals.ts:179` vs `:194`). Both are tested and intentional (the impact-why tag already has a `coverage:` prefix), but anyone grepping the codebase for the new state has to know to check both spellings. Not a bug.

3. **`coverageKnown` is captured at `createSignalComputer` construction, never refreshed.** This is correct for current call sites — every tool entry point (`symbol_graph`, `impact`, `trace`, `symbol-card`) instantiates a fresh computer per call — but if a future caller cached the computer across an `indexProject` boundary, `coverageKnown` would go stale. Acceptable for v1; flag if the signal layer is ever moved to a long-lived computer instance.

4. **Verify report's `impact` lookup of `SqliteGraphStore.hasCoverageData` returned "Symbol not found".** That's an indexer indexing-naming quirk, not a bug in this PR — methods are stored in the graph as `SqliteGraphStore.hasCoverageData` only when interface-method extraction is wired (M8 work), not as a separate seed. The verifier worked around it with a direct source read, which is fine for now.

## Recommendations

- Consider exposing the metadata table as a more general key/value store (only one key today) when a second use case appears. Spec already permits this and the schema allows it; right now I'd resist generalizing further to avoid YAGNI.
- If/when read-only graceful-degradation gets tightened, add `markCoverageIndexed()` to the list of write paths the extension's "indexing-failed" detector inspects, so the user gets a helpful note when an old DB is being read in-place rather than silent `coverage-unknown` everywhere.

## Assessment

**ready**

The change implements all nine acceptance criteria correctly, preserves `tested`/`untested` semantics, and adds the new `coverage-unknown` state cleanly. The one real defect — read-only legacy DBs crashing through `hasCoverageData()` → `createSignalComputer()` — was caught by the codex review and fixed inline with a regression test. Final state:

- `bun test`: 421 pass, 0 fail (was 420; +1 legacy-DB regression test added).
- `bun run check`: clean (`tsc --noEmit`).
- The original verify-phase reproduction (`coverage-unknown` for an unindexed store) still produces `[entry-point, leaf, coverage-unknown]`.
- Backward compatibility verified end-to-end: a hand-crafted pre-#082 SQLite database on a read-only mount no longer breaks `createSignalComputer`.
