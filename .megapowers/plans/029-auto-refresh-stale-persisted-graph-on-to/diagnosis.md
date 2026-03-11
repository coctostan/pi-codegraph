# Diagnosis

## Root Cause

**File:** `src/index.ts`, function `ensureIndexed()` (line 77 at commit `45765877`)

The `ensureIndexed()` function guarded re-indexing on an empty database:

```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}
```

The `store.listFiles().length === 0` check was intended as a "first-run only" optimization, but it prevented the incremental change detection built into `indexProject()` from ever running on an existing database. `indexProject()` already compares per-file SHA-256 hashes and only re-indexes files whose content has changed — calling it on an already-indexed project is fast (skips unchanged files). The guard was unnecessary and harmful.

## Trace

**Symptom → Root Cause chain:**

1. **Symptom:** Tool output contains stale line numbers with `[stale]` markers (e.g., `src/graph/store.ts:30:... [stale]` instead of `src/graph/store.ts:33:...`)

2. **`computeAnchor()`** (`src/output/anchoring.ts:16-47`) detects staleness by comparing the node's `content_hash` against the current file's SHA-256 hash. When they differ, it marks the result `stale: true`. This function is *correct* — it's accurately reporting that the stored node data doesn't match the current file.

3. **Why is the node data stale?** Because the graph store still holds nodes indexed from the old file content. The nodes have the old `content_hash` and old `start_line` values.

4. **Why wasn't the graph refreshed?** Each tool handler calls `ensureIndexed(projectRoot, store)` before querying. But `ensureIndexed()` checked `store.listFiles().length === 0` — since the DB already had 22 tracked files, it returned immediately without calling `indexProject()`.

5. **Why does `indexProject()` have the right behavior?** (`src/indexer/pipeline.ts:53-129`) It iterates all `.ts`/`.tsx` files, computes SHA-256 for each, compares against `store.getFileHash(rel)`, and only re-indexes files where the hash changed. Unchanged files are skipped (`skipped++`). This is the correct incremental behavior — it just was never invoked.

## Affected Code

| File | Function | Role |
|------|----------|------|
| `src/index.ts:77-79` | `ensureIndexed()` | **The bug** — guard prevents incremental refresh |
| `src/index.ts:69-75` | `getOrCreateStore()` | Opens existing `.codegraph/graph.db` with stale data |
| `src/index.ts:105,140,163,183,197` | All 5 tool `execute()` handlers | All call `ensureIndexed()` — all affected |
| `src/indexer/pipeline.ts:53-129` | `indexProject()` | Has correct incremental logic — was being skipped |
| `src/output/anchoring.ts:16-47` | `computeAnchor()` | Correctly detects and marks stale nodes |

## Pattern Analysis

**Working pattern:** `indexProject()` itself uses the correct incremental approach:
```typescript
const hash = sha256Hex(content);
const existing = store.getFileHash(rel);
if (existing === hash) { skipped++; continue; }  // fast skip for unchanged files
// ... re-index changed file
```

**Broken pattern:** `ensureIndexed()` used a coarser check:
```typescript
if (store.listFiles().length === 0) { ... }  // all-or-nothing
```

The mismatch: `indexProject()` thinks file-level, `ensureIndexed()` thought database-level. The fix is to remove the database-level guard and let `indexProject()` handle granularity.

## Risk Assessment

**Low risk.** The fix (removing the `listFiles().length === 0` guard) simply delegates to `indexProject()`, which already has the right incremental behavior. The only cost is that `indexProject()` now runs on every tool call — but it's O(n) file hash comparisons where n = number of tracked files, and unchanged files are skipped immediately after a hash comparison. For a typical project with 20-50 files, this is sub-millisecond overhead.

**What depends on `ensureIndexed()`:** All 5 tool handlers (`symbol_graph`, `resolve_edge`, `impact`, `trace`, `graph_query`) call it. The fix improves all of them uniformly.

**No related bugs sharing this root cause.** The staleness detection in `computeAnchor()` and the incremental logic in `indexProject()` are both correct — only the gateway function was wrong.

## Fixed When

Regression test sufficient — `test/extension-stale-db-refresh.test.ts` already covers the exact scenario:
1. Index a project, modify a file to shift line numbers, re-invoke tool
2. Assert result contains updated line number (`:33:` not `:30:`)
3. Assert result does NOT contain `[stale]`

The fix (already applied at commit `2b4c5693`) is a 3-line deletion:
```diff
 async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
-  if (store.listFiles().length === 0) {
-    await indexProject(projectRoot, store);
-  }
+  await indexProject(projectRoot, store);
 }
```
