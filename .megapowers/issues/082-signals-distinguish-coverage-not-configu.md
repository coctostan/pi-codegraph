---
id: 82
type: feature
status: done
created: 2026-04-20T10:32:55.993Z
priority: 4
---
# signals: distinguish "coverage not configured" from "covered but untested symbol" in [untested] tag
## Problem

Every symbol in the graph carries `[untested]` in its signals. This tag currently means "no `tested_by` edge exists", but it doesn't distinguish between:

1. **Coverage not configured** — V8 coverage stage was never run; `tested_by` edges are absent for the entire graph
2. **Coverage ran but this symbol was never hit** — genuinely untested code
3. **Coverage ran and this symbol was hit but not by a test** (runtime-only execution)

An agent reading `[untested]` on all symbols has no signal about test quality — it looks the same whether the project has 100% coverage with a missing config file or zero tests.

## Fix

Add a graph-level metadata flag: when the coverage stage runs successfully, write a sentinel node or a metadata row (e.g. `_coverage_indexed` in the `files` table or a `meta` table). 

In `createSignalComputer` (src/output/signals.ts:48), check for this sentinel:
- If sentinel absent → omit `untested` tag entirely and emit `coverage-unknown` instead
- If sentinel present and no `tested_by` edge → emit `untested` as today

## Location

- `src/indexer/coverage.ts` — `runCoverageIndexStage` (line 146) — write sentinel on successful completion
- `src/output/signals.ts` — `createSignalComputer` / base signals computation — check sentinel before applying `untested`
- `src/graph/store.ts` / `src/graph/sqlite.ts` — add a `hasCoverageData(): boolean` method to `GraphStore`

## Acceptance criteria

- When no coverage stage has run: signals show `[coverage-unknown]` instead of `[untested]`
- When coverage has run and symbol has no `tested_by` edge: signals show `[untested]` as before
- `GraphStore` interface has `hasCoverageData(): boolean`
- `SqliteGraphStore` implements it
- Existing signal tests still pass
