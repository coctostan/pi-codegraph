# Feature: M5 Git Co-Change Analysis & Tree-Sitter Hardening

**Issue:** #027 (batch: #017, #018)  
**Branch:** `feat/027-m5-git-co-change-analysis-hardening`

---

## What Was Built

### Stage 5: Git Co-Change Indexer (`src/indexer/git.ts`)

A new indexer stage that mines commit history to surface files that change together frequently. These co-evolution signals help agents find implicit coupling that static call-graph analysis misses.

**How it works:**
1. Spawns `git log --name-only --format="__COMMIT__%H %aI" --diff-filter=AMRT` to retrieve all commits with their changed files and author timestamps.
2. For each commit, computes all pairs of co-changed files that are already tracked in the graph.
3. Accumulates a weighted score per pair using exponential decay: `weight = 0.5^(ageDays / halfLifeDays)` where `halfLifeDays = windowDays / 4`. Recent commits contribute more than old ones.
4. Emits `module → module` edges with kind `co_changes_with` and provenance source `git` for pairs exceeding the minimum co-change threshold (default: 2).
5. Edge evidence: `co_changes: N, recency_score: X.X, window: Nd`.
6. Edge confidence: `min(0.9, 0.3 + count * 0.1)` — grows with co-change frequency, capped at 0.9.

**Incremental design:**  
The last-analyzed HEAD commit SHA is stored in `file_hashes` under the sentinel key `__git_cochange_head__`. On each pipeline run, if HEAD hasn't changed, the stage is skipped entirely. When HEAD changes, all prior `co_changes_with/git` edges are deleted and rebuilt from scratch.

**Graceful degradation:**  
When the project directory is not a git repository, or has no commits, the stage exits silently without error and without creating any edges.

### Tree-Sitter Indexer Hardening (`src/indexer/tree-sitter.ts`)

Five edge-case import patterns were previously unhandled or incorrect:

| Pattern | Before | After |
|---------|--------|-------|
| `import { foo as bar }` | Edge targeted `bar` (alias) | Edge targets `foo` (original); calls to `bar()` resolve to `foo` |
| `import * as utils` | No extraction | Emits `imports` edge to `*`; `utils.method()` calls emit `calls` edges to `method` |
| `export { foo } from "./bar"` | No extraction | Emits `imports` edge targeting `foo` in source module |
| `export { foo as baz } from "./bar"` | No extraction | Emits `imports` edge targeting `foo` (original, not alias) |
| `import("./mod")` | No extraction | Emits `imports` edge with `confidence: 0.3` (dynamic = lower certainty) |

### Pipeline Timing Instrumentation (`src/indexer/pipeline.ts`)

Each of the 5 indexer stages is now wrapped with `performance.now()` timing. `IndexResult` gains a `timings: Record<string, number>` field with stage durations in integer milliseconds:

```ts
{ timings: { "tree-sitter": 83, lsp: 412, "ast-grep": 28, coverage: 1, git: 35 } }
```

The cleanup loop also gained a guard (`oldFile.startsWith("__")`) to prevent the git HEAD sentinel from being misidentified as a deleted file.

### SQLite Index Coverage (`src/graph/sqlite.ts`)

Two new indexes added to cover tool query patterns:
- `idx_nodes_name ON nodes(name)` — accelerates `findNodes` and `symbol_graph` lookups by symbol name
- `idx_edges_kind ON edges(kind)` — accelerates `graph_query` kind filters

All three existing indexes are preserved.

### `getStatistics()` with Staleness Detection (`src/graph/store.ts`, `src/graph/sqlite.ts`)

New method on the `GraphStore` interface:

```ts
getStatistics(projectRoot?: string): GraphStatistics
// Returns:
{
  nodes: Record<string, number>;           // count per kind
  edges: Record<string, Record<string, number>>; // count per kind+provenance
  files: { total: number; stale: number };  // tracked + stale
}
```

When `projectRoot` is provided, staleness detection reads each tracked file from disk, computes its SHA-256, and compares it to the stored hash. Files that have changed since last indexing (or are missing) are counted as stale.

Sentinel keys (those starting with `__`) are excluded from file statistics so infrastructure bookkeeping doesn't pollute counts.

---

## Why

**Git co-change (#017):** Static call graphs miss implicit dependencies — feature flags, shared migrations, coordinated API changes, test-fixture coupling. Co-change edges give agents a complementary signal: "these two files almost always change together." Combined with `symbol_graph`, an agent can navigate from a co-change cluster to the specific functions involved.

**Edge case hardening (#018):** Real TypeScript codebases use aliased imports and barrel `index.ts` files extensively. Without correct extraction, `symbol_graph` would miss most cross-module call edges in any project using re-exports as the public API surface. Namespace imports are particularly common in utility libraries. Dynamic imports are used in lazy-loading patterns critical to performance analysis.

**Observability:** Stage timings and `getStatistics()` give agents and tooling authors the data needed to detect bottlenecks and validate that incremental indexing is working.

---

## Files Changed

| File | Change |
|------|--------|
| `src/indexer/git.ts` | New — Stage 5 git co-change indexer |
| `src/indexer/pipeline.ts` | Wires Stage 5, adds timing, `__` sentinel guard |
| `src/indexer/tree-sitter.ts` | Aliased imports, namespace imports, re-exports, dynamic imports |
| `src/graph/store.ts` | `GraphStatistics` interface, `getStatistics()` on `GraphStore` |
| `src/graph/sqlite.ts` | `getStatistics()` impl, 2 new indexes, sentinel exclusion |
| `test/indexer-git-cochange.test.ts` | New — co-change edges, threshold, recency |
| `test/indexer-git-incremental.test.ts` | New — HEAD-based skip/rebuild |
| `test/indexer-git-no-repo.test.ts` | New — non-git dir, empty repo, stderr suppression |
| `test/indexer-pipeline-git-stage.test.ts` | New — end-to-end pipeline with git stage |
| `test/indexer-index-result-shape.test.ts` | New — backward compat for `IndexResult` |
| `test/indexer-dynamic-imports.test.ts` | New — dynamic import confidence 0.3 |
| `test/indexer-namespace-imports.test.ts` | New — namespace import + qualified call |
| `test/indexer-reexports.test.ts` | New — re-export original name, barrel |
| `test/graph-store-statistics.test.ts` | New — node/edge/file statistics |
| `test/graph-store-staleness.test.ts` | New — stale file detection |
| `test/graph-store-indexes.test.ts` | New — index existence assertions |
| `test/graph-store-statistics-sentinel.test.ts` | New — sentinel key excluded from file counts (code-review fix) |
| `test/indexer-extract-file.test.ts` | Updated aliased import test to assert correct behavior |
| `test/indexer-index-project.test.ts` | `toEqual` → `toMatchObject` for `IndexResult` with `timings` |
| `test/graph-types.typecheck.ts` | Added `getStatistics` stub |

**Test result:** 194 pass, 0 fail (including 1 regression test added during code review)
