# Bugfix Summary: Auto-refresh stale persisted graph on tool invocation (#029)

## Problem
When `.codegraph/graph.db` already existed from a prior session, all 5 tools (`symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`) returned stale anchors with `[stale]` markers instead of refreshing the index when source files had changed.

## Root Cause
`ensureIndexed()` in `src/index.ts` guarded re-indexing with `store.listFiles().length === 0`, meaning it only indexed an **empty** database. The incremental hash-based change detection built into `indexProject()` was never invoked on an existing DB.

## Fix
Removed the `listFiles().length === 0` guard so `ensureIndexed()` unconditionally calls `indexProject()`. The `indexProject()` function already has correct incremental logic — it compares per-file SHA-256 hashes and skips unchanged files, so repeated calls on an unchanged project are fast (sub-millisecond).

```diff
 async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
-  if (store.listFiles().length === 0) {
-    await indexProject(projectRoot, store);
-  }
+  await indexProject(projectRoot, store);
 }
```

## Files Changed
- `src/index.ts` — removed empty-DB guard in `ensureIndexed()`
- `test/extension-stale-db-refresh.test.ts` — regression test

## How to Verify
```bash
bun test test/extension-stale-db-refresh.test.ts
```
The test indexes a project, modifies a file to shift line numbers by 3, re-invokes `symbol_graph`, and asserts:
1. Result contains updated anchor `src/graph/store.ts:33:` (not stale `:30:`)
2. Result does NOT contain `[stale]`

## Impact
Low risk. All 5 tool handlers benefit uniformly. No performance regression — unchanged files are skipped via hash comparison.
