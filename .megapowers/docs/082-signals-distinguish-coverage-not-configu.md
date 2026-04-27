# 082 — Distinguish `coverage-unknown` from `untested` in symbol signals

## Problem

The signal layer printed every symbol without an outgoing `tested_by` edge as `untested` — regardless of whether the coverage stage had ever run. That conflated two very different situations:

1. **Coverage was indexed, this symbol simply has no tests.** → genuinely uncovered, action: write a test.
2. **Coverage was never indexed.** → we have no idea, action: configure `bun test --coverage` (or equivalent) and re-index.

Agents can't tell those apart from `[leaf, untested]`, so the signal was lying to them whenever the project hadn't run the coverage stage yet.

## Goal

Add a third coverage state at the signal layer:

- `tested` — symbol has an outgoing `tested_by` edge.
- `untested` — coverage was indexed, no `tested_by` edge.
- `coverage-unknown` — coverage was never indexed for this graph.

## Solution

A single boolean lives in the graph database — `graph_metadata(key='coverage_indexed', value='1')`. It is written exactly once: at the end of every successful `runCoverageIndexStage`. The signal layer reads it once at `createSignalComputer` construction and threads it onto every `NodeSignals` record as `coverageKnown`.

### Architecture

```
┌────────────────────────────┐         ┌─────────────────────────┐
│ runCoverageIndexStage      │ writes  │  graph_metadata          │
│  src/indexer/coverage.ts   │────────▶│  coverage_indexed = "1"  │
└────────────────────────────┘         └─────────────────────────┘
                                                  │ reads
                                                  ▼
┌────────────────────────────┐
│ createSignalComputer       │ caches `coverageKnown` once per call
│  src/output/signals.ts     │
└────────────────────────────┘
              │
              ▼
   formatRoleTags / formatImpactWhy
   tested → "tested"
   !tested && coverageKnown → "untested"
   !tested && !coverageKnown → "coverage-unknown" (or "unknown" in impactWhy)
```

The single sentinel was deliberately preferred over a richer metadata framework — out of scope per spec, and YAGNI given the only consumer today is the signal layer.

## API surface

### New `GraphStore` methods (`src/graph/store.ts:48–49`)

```ts
hasCoverageData(): boolean;
markCoverageIndexed(): void;
```

### `SqliteGraphStore` (`src/graph/sqlite.ts`)

- New table created in `initSchema()`:
  ```sql
  CREATE TABLE IF NOT EXISTS graph_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  ```
- `hasCoverageData()` returns `false` when the row is absent. It is **defensive** against legacy databases (created before this change) and read-only mounts where the implicit `CREATE TABLE IF NOT EXISTS` migration silently no-ops — both surface as `no such table: graph_metadata`, and the method swallows that error and returns `false` rather than crashing the signal layer.
- `markCoverageIndexed()` uses `INSERT OR REPLACE`, so it is idempotent.

### `runCoverageIndexStage` (`src/indexer/coverage.ts:197–201`)

```ts
try {
  store.markCoverageIndexed();
} catch {
  // readonly DB or other write failure: leave sentinel unset
}
```

The mark happens **after** all `tested_by` edges and `TestTraceRecord`s are written, so any execution that completes without throwing — including missing coverage dir, empty coverage dir, and reports that don't map to any indexed nodes — flips the sentinel. That's what discriminates AC 4 ("zero outgoing `tested_by` edges still counts as known coverage") from a graph that simply hasn't been indexed.

### `NodeSignals` (`src/output/signals.ts:6–15`)

Adds `coverageKnown: boolean`. Captured once per `createSignalComputer` (line 54) so the per-node hot path is unaffected. The empty-node fallback returns `coverageKnown: false`.

### Format functions

`formatRoleTags`:
```ts
const coverageTag = signals.tested
  ? "tested"
  : signals.coverageKnown ? "untested" : "coverage-unknown";
```

`formatImpactWhy` mirrors the ladder but uses `unknown` (the `coverage:` prefix already supplies the namespace).

## Backward compatibility

- **Fresh installs:** new `graph_metadata` table is created on first open, sentinel starts unset → first tools call may render `coverage-unknown`; first index run flips it to `untested`/`tested`.
- **Existing writable `graph.db`:** `CREATE TABLE IF NOT EXISTS` adds the table on next open; no schema migration needed.
- **Existing read-only `graph.db` mounts:** the implicit migration no-ops, leaving the table missing. `hasCoverageData()` catches the resulting `SQLiteError: no such table` and returns `false`. Output degrades to `coverage-unknown` everywhere — accurate, and crucially does **not** break the signal layer or the read-only graceful-degradation paths in `src/index.ts`.

## Tests

Seven new test files, six existing fixtures touched:

| File | Covers |
|------|--------|
| `test/graph-store-coverage-metadata.test.ts` | AC 1, 2, 3 (read/write/persistence) |
| `test/graph-store-coverage-metadata-legacy-db.test.ts` | Backward compat — legacy DB without `graph_metadata` does not crash |
| `test/indexer-coverage-stage-mark-indexed.test.ts` | AC 4 (missing/empty/no-match coverage dir all set the sentinel) |
| `test/output-signals-coverage-known.test.ts` | `NodeSignals.coverageKnown` wiring |
| `test/output-signals-format-coverage-unknown.test.ts` | AC 5/6/7 for `formatRoleTags` |
| `test/output-signals-impact-why-coverage-unknown.test.ts` | AC 5/6/7 for `formatImpactWhy` |
| `test/signals-coverage-unknown-fresh-index.test.ts` | End-to-end: manual store → `coverage-unknown`; freshly-indexed project with no coverage → `untested` |

Existing fixtures that asserted `untested` were updated to call `store.markCoverageIndexed()` so their assertions still match the new three-state ladder.

## Verification

- `bun test`: 421 pass, 0 fail.
- `bun run check`: clean.
- Direct reproduction: a fresh `SqliteGraphStore` with one `addNode()` call now reports `{"hasCoverageData":false,"tested":false,"coverageKnown":false,"tags":"[entry-point, leaf, coverage-unknown]"}`.

## Out of scope (deferred)

- Separate `runtime-covered` / `covered-but-not-by-test` signal — distinct behavior class, not needed by this slice.
- Redesigning coverage parsing or report discovery.
- Generalizing `graph_metadata` to a richer key/value store — single key today; revisit when a second consumer appears.
