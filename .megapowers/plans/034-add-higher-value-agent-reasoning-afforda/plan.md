# Plan

### Task 1: Extract `is_exported` metadata from tree-sitter symbols

**Files:**
- Create: `test/indexer-exported-symbols.test.ts`
- Modify: `src/graph/types.ts`
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-exported-symbols.test.ts`

**TDD Steps:**
1. Add a new extraction test that asserts exported function/class/interface/arrow symbols set `is_exported: true`, non-exported symbols set `false`, and the module node stays `false`.
2. Run `bun test test/indexer-exported-symbols.test.ts` and confirm it fails with an assertion showing `is_exported` is missing, e.g. `Expected path: [\"is_exported\"]` / `Received: undefined`.
3. Add `is_exported?: boolean` to `GraphNode` in `src/graph/types.ts` so existing tests that construct `GraphNode` literals stay valid, add a tree-sitter helper that detects `export_statement` ancestry, set `module.is_exported = false`, and pass the export bit into every symbol-producing `addNode(...)` call. Task 3 must treat missing/undefined `is_exported` as `false` when computing entry-point signals.
4. Re-run `bun test test/indexer-exported-symbols.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 2: Persist `is_exported` in SQLite nodes [depends: 1]

**Files:**
- Create: `test/graph-store-exported-flag.test.ts`
- Modify: `src/graph/sqlite.ts`
- Test: `test/graph-store-exported-flag.test.ts`

**TDD Steps:**
1. Add a store test that inserts a node with `is_exported: true`, expects `getNode()` to round-trip it, and verifies `PRAGMA table_info(nodes)` includes an `is_exported` column.
2. Run `bun test test/graph-store-exported-flag.test.ts` and confirm it fails because the schema/query layer does not persist the flag.
3. Update the SQLite schema, add an idempotent `ALTER TABLE` migration for existing DBs, and thread `is_exported` through `addNode`, `getNode`, `findNodes`, `getNodesByFile`, and neighbor row hydration. Because `ALTER TABLE ... ADD COLUMN` yields `NULL` for pre-existing rows until rewritten, coerce hydrated values with `Boolean(row.is_exported)` so missing/NULL flags read back as `false`.
4. Re-run `bun test test/graph-store-exported-flag.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 3: Add a shared signal computer for roles and quantitative signals [depends: 2]

**Files:**
- Create: `src/output/signals.ts`
- Create: `test/output-signals.test.ts`
- Test: `test/output-signals.test.ts`

**TDD Steps:**
1. Add a new unit test file that covers: distinct call fan-in/fan-out counting, `entry-point` / `hub` / `leaf` tagging, `tested` / `untested`, `framework-mediated`, module-based co-change scoring, and formatting helpers for role tags and impact why annotations, including the `leaf` role appearing first in `formatImpactWhy(...)` for an untested leaf candidate.
2. Run `bun test test/output-signals.test.ts` and confirm it fails because `src/output/signals.ts` does not exist.
3. Create `src/output/signals.ts` with `NodeSignals`, `SignalComputer`, `createSignalComputer(store)`, distinct call-neighbor counting, module-node lookup by file, git evidence parsing for `co_changes`, `formatRoleTags(...)`, and `formatImpactWhy(...)`.
4. Re-run `bun test test/output-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 4: Rank impact dependents and compute weakest-link path confidence [depends: 3]

**Files:**
- Create: `test/tool-impact-ranking.test.ts`
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-ranking.test.ts`

**TDD Steps:**
1. Add a new impact test that asserts `collectImpactDetails(...)` returns dependents ordered by priority and that transitive results carry weakest-link chain confidence, including the depth-2 behavioral `a1` / `a2` / `a3` callers reached through `shared <- api <- a*`.
2. Run `bun test test/tool-impact-ranking.test.ts` and confirm it fails because `collectImpactDetails` is not exported.
3. Replace `src/tools/impact.ts` with a version that adds `ImpactDetail`, deduplicates inbound callers by highest-confidence edge per hop, performs breadth-first traversal, records path confidence, uses the shared signal computer for ranking, preserves `collectImpact(...)` for backward compatibility, and keeps anchored output unchanged for now.
4. Re-run `bun test test/tool-impact-ranking.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 5: Append always-on impact why annotations [depends: 4]

**Files:**
- Create: `test/tool-impact-output-signals.test.ts`
- Modify: `src/tools/impact.ts`
- Modify: `test/extension-impact.test.ts`
- Test: `test/tool-impact-output-signals.test.ts`

**TDD Steps:**
1. Add a tool-level impact output test that writes real fixture files, calls `impact(...)`, and asserts the line still contains anchor + classification + depth plus an inline bracketed annotation with role tags, `fan-in`, coverage, `co-change`, and `chain-confidence`; also update the existing exact-line regex assertions in `test/extension-impact.test.ts` to accept the new trailing annotation with an optional stale marker `( \[stale\])?` between `depth:1` and the new bracketed suffix.
2. Run `bun test test/tool-impact-output-signals.test.ts` and confirm it fails because the annotation is missing.
3. Update only the `impact(...)` renderer in `src/tools/impact.ts` to call `formatImpactWhy(hit.signals, hit.chainConfidence)` and append the returned bracketed suffix without removing stale markers, `classification`, or `depth`, then update `test/extension-impact.test.ts` so its exact-line regexes match the new annotated output by keeping the optional stale marker `( \[stale\])?` between `depth:1` and `  \[fan-in:`.
4. Re-run `bun test test/tool-impact-output-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 6: Add inline role tags to symbol_graph output [depends: 3]

**Files:**
- Create: `test/tool-symbol-graph-signals.test.ts`
- Modify: `src/output/anchoring.ts`
- Modify: `src/tools/symbol-graph.ts`
- Test: `test/tool-symbol-graph-signals.test.ts`

**TDD Steps:**
1. Add a symbol graph test that asserts the resolved symbol header anchor line gets `[entry-point, tested]`-style tags and resolved neighbor lines get `[leaf, untested]`-style tags.
2. Run `bun test test/tool-symbol-graph-signals.test.ts` and confirm it fails because no inline tags are present.
3. Extend `AnchoredNeighbor` and `SymbolHeader` with an optional `signals` field in `src/output/anchoring.ts`, update the header/section renderers to append tags inline, then update `src/tools/symbol-graph.ts` to compute signals via the shared signal computer for the resolved symbol and resolved neighbors while leaving unresolved rows unchanged.
4. Re-run `bun test test/tool-symbol-graph-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 7: Add inline signal tags to trace steps [depends: 3]

**Files:**
- Create: `test/tool-trace-signals.test.ts`
- Modify: `src/tools/trace.ts`
- Test: `test/tool-trace-signals.test.ts`

**TDD Steps:**
1. Add a trace test that saves a coverage trace, renders it through `trace(...)`, and asserts production/helper step lines gain inline role tags while the `mode:` header remains unchanged; add a `calls` edge from `prod` to `helper` so `prod` is not tagged as a `leaf`.
2. Run `bun test test/tool-trace-signals.test.ts` and confirm it fails because step lines do not include tags.
3. Update `src/tools/trace.ts` to create one shared signal computer per invocation and append `formatRoleTags(...)` output in both stored coverage step rendering and live static step rendering; with the added `prod -> helper` call edge, `prod` should render `[entry-point, tested]` and `helper` should render `[leaf, untested]`.
4. Re-run `bun test test/tool-trace-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.

### Task 8: Cache signal computation for impact-scale performance [depends: 5]

**Files:**
- Create: `test/tool-impact-performance.test.ts`
- Modify: `src/output/signals.ts`
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-performance.test.ts`

**TDD Steps:**
1. Add a performance regression test that builds an in-memory graph with 120 impacted symbols, calls `impact(...)`, asserts 120 annotated lines are returned, and requires total render time under one second.
2. Run `bun test test/tool-impact-performance.test.ts`. If it already passes because the 120-symbol in-memory graph renders under one second, treat it as a regression guard and continue; if it fails, the expected failure is the timing assertion for the under-one-second threshold. Either way, proceed to Step 3 to add memoization so the test remains green as the graph scales.
3. Add memoization to `createSignalComputer(...)` for base signals, module lookup, and changed-set co-change scores, then thread a single `SignalComputer` instance through `collectImpactDetails(...)` and `impact(...)` so traversal, ranking, and rendering share cached results.
4. Re-run `bun test test/tool-impact-performance.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
