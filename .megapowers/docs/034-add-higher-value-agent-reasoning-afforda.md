# Feature: Agent Reasoning Affordances — Shared Signal Layer

**Issue:** `034-add-higher-value-agent-reasoning-afforda`
**Milestone:** M5 polish / cross-tool signal layer

---

## What Was Built

A shared node-signal layer (`src/output/signals.ts`) that computes structural role and risk signals from the already-indexed graph, surfaced as compact always-on inline annotations in `impact`, `symbol_graph`, and `trace`. Agents can now prioritize what to inspect at a glance without extra tool calls.

---

## Why

Before this change, the graph tools returned purely structural data — anchored lines, classifications, depths — but gave no signal about _importance_. An agent querying `impact` for a breaking change would receive a flat list with no hint about which dependent was an untested hub used by dozens of callers versus a leaf tested by a suite. This forced follow-up `symbol_graph` calls to build a picture that the graph already had enough data to provide inline.

---

## What Changed

### New: `src/output/signals.ts`
The single source of truth for role and ranking signals:

- **Fan-in / fan-out** — distinct `calls` neighbor counts (duplicate provenance rows do not inflate counts via `Set`-based deduplication).
- **Role tags:** `entry-point` (exported non-module with `fanIn=0`), `hub` (`fanIn≥3 && fanOut≥3`), `leaf` (`fanOut=0`).
- **Coverage tags:** `tested` (has at least one `tested_by` edge), `untested` (has none), `framework-mediated` (has at least one incident edge with `ast-grep` provenance).
- **Co-change score** — derived from `co_changes_with` module edges; non-module symbols are mapped to their file's module node; the highest `co_changes` value from the changed-symbol set is used for impact ranking.
- **`formatRoleTags(signals)`** — compact `[entry-point, tested]` suffix for `symbol_graph` and `trace`.
- **`formatImpactWhy(signals, chainConfidence)`** — compact `[fan-in:5  untested  co-change:7  chain-confidence:0.81]` suffix for `impact`.
- **Memoization** — base signals, module lookups, and per-changed-symbol co-change scores are cached within a single `SignalComputer` instance to keep the 120-symbol performance budget under 1 second.

### Modified: `src/graph/types.ts` + `src/indexer/tree-sitter.ts`
`is_exported` flag added to `GraphNode` and extracted from `export_statement` ancestry during tree-sitter parsing. Used by the signal layer for `entry-point` detection.

### Modified: `src/graph/sqlite.ts`
Schema migration adds `is_exported INTEGER` column; hydration coerces `NULL` to `false`. All read/write paths (`addNode`, `getNode`, `findNodes`, `getNodesByFile`, neighbor rows) thread the flag through.

### Modified: `src/tools/impact.ts`
- `collectImpactDetails()` — BFS traversal with per-hop strongest-edge deduplication; carries weakest-link chain confidence.
- `compareDetails()` — deterministic sort: `breaking` before `behavioral`, higher `fanIn`, `untested` before `tested`, higher co-change, higher chain confidence, shallower depth, then file/name.
- Every rendered line gains an inline bracketed `formatImpactWhy` suffix. Existing stale markers, `classification`, and `depth` are preserved.

### Modified: `src/output/anchoring.ts` + `src/tools/symbol-graph.ts`
`AnchoredNeighbor` and `SymbolHeader` gain an optional `signals` field. Resolved header and resolved neighbor lines get inline `[tag, ...]` suffixes; unresolved rows are unchanged.

### Modified: `src/tools/trace.ts`
One `SignalComputer` per invocation. Both stored coverage steps and live static steps gain inline `formatRoleTags` suffixes. The `mode:` header and step ordering are unchanged.

---

## New Test Files

| File | What it covers |
|---|---|
| `test/indexer-exported-symbols.test.ts` | `is_exported` extraction for function/class/interface/arrow; non-exported and module stay false |
| `test/graph-store-exported-flag.test.ts` | Round-trip persistence; schema column presence; NULL coercion |
| `test/output-signals.test.ts` | Fan-in/out deduplication; all role/coverage/framework-mediated tags; co-change module derivation; formatters |
| `test/tool-impact-ranking.test.ts` | `collectImpactDetails` ranking order; weakest-link chain confidence; untested-before-tested precedence |
| `test/tool-impact-output-signals.test.ts` | Full bracketed annotation presence on impact output lines |
| `test/tool-symbol-graph-signals.test.ts` | Resolved header and neighbor inline tags; unresolved rows untouched |
| `test/tool-trace-signals.test.ts` | Step line tags; mode header unchanged |
| `test/tool-impact-performance.test.ts` | 120-symbol annotated impact under 1 second |

---

## Test Results (Verification)

```
209 pass, 0 fail, 639 expect() calls
Ran 209 tests across 93 files. [7.29s]
```

All 14 acceptance criteria verified.

---

## Design Notes

- Signal computation reads only `store.getNode` / `store.getNeighbors` / `store.getNodesByFile` — no subprocess spawning, no network, no new dependencies.
- The `is_exported` flag is additive (`?:` on `GraphNode`); missing/undefined reads as `false` everywhere — no existing test literals required updating.
- `ALTER TABLE ... ADD COLUMN` migration is idempotent (catches `duplicate column` errors silently).
- Annotations are always-on with no new parameters — consistent with the extension's zero-configuration philosophy.
