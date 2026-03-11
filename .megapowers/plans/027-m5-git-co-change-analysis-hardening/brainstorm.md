# Brainstorm: 027-m5-git-co-change-analysis-hardening

## Goal

Complete the M5 milestone by adding Stage 5 git co-change indexing (file-level `co_changes_with` edges from commit history) and hardening the existing indexer against edge cases (re-exports, barrel files, aliased imports, namespace imports, dynamic imports). Also add pipeline timing instrumentation, index statistics reporting, staleness detection, and ensure SQLite indexes cover all tool query patterns.

## Mode

`Direct requirements` — Both source issues describe concrete, well-scoped work. The architecture is established, types already exist (`co_changes_with`, `git` provenance), and the gaps are clearly enumerated. No design ambiguity remains after clarifications.

## Must-Have Requirements

**Git Co-Change Analysis (Stage 5 Indexer)**

- `R1` — New `src/indexer/git.ts` implements Stage 5: parse `git log` to identify files that frequently change together in the same commits.
- `R2` — Co-change edges are created at file level: module node → module node with kind `co_changes_with` and provenance source `git`.
- `R3` — Commit history windowing: recent commits are weighted higher than old ones (e.g., exponential decay or time-bucketed weighting).
- `R4` — Edge evidence includes: co-change commit count, recency score, and the time window analyzed.
- `R5` — A minimum co-change threshold is applied (configurable) so that a single shared commit doesn't create an edge.
- `R6` — The co-change stage is wired into the indexing pipeline (`pipeline.ts`) as Stage 5, running after coverage.
- `R7` — Co-change indexing is incremental: skip re-analysis if the git HEAD hasn't changed since last run (store last-analyzed commit hash).

**Edge Case Hardening (Tree-Sitter Indexer)**

- `R8` — Aliased imports (`import { foo as bar }`) create edges that track both the original name and the local alias, so calls to `bar()` resolve to `foo`.
- `R9` — Namespace imports (`import * as utils from "./mod"`) are extracted, and calls like `utils.helper()` create edges to `helper` in the target module.
- `R10` — Re-exports (`export { foo } from "./bar"` and `export { foo as baz } from "./bar"`) create transitive import edges so barrel files connect consumers to actual definitions.
- `R11` — Barrel file awareness: when an import targets an `index.ts` file, re-export edges from that file are followed to find the actual source module.
- `R12` — Dynamic imports (`import("./mod")`) are extracted as import edges with lower confidence (e.g., 0.3) since the target may be computed.

**Performance & Observability**

- `R13` — Pipeline timing instrumentation: each indexer stage logs its wall-clock duration. Timings are available programmatically (returned from the pipeline function or emitted as structured data).
- `R14` — SQLite indexes are reviewed and added to cover all query patterns used by the 5 tools (symbol_graph, resolve_edge, trace, impact, graph_query).
- `R15` — Index statistics function: returns node count by kind, edge count by kind and provenance source, and file count (total, indexed, stale).
- `R16` — Staleness reporting: identify files where the stored content hash no longer matches the current file content, and edges whose source file content hash is stale.

## Optional / Nice-to-Have

- `O1` — Co-change edges carry a list of sample shared commit SHAs (up to 5) in the evidence field for debuggability.
- `O2` — Type-only imports (`import type { T }`) are distinguished from value imports with a metadata flag or separate edge kind.
- `O3` — Index statistics include a "last indexed" timestamp and total indexing duration from last run.

## Explicitly Deferred

- `D1` — Symbol-level co-change analysis (mapping git diffs to specific symbols within files). File-level is sufficient; the agent can combine co-change with `symbol_graph` to bridge.
- `D2` — Formal benchmark suite or performance regression testing against large projects. Timing instrumentation is sufficient for now.
- `D3` — Documentation (tool usage guide, framework rule authoring guide) — separate concern from this batch.

## Constraints

- `C1` — Git analysis uses the `git` CLI via child process (same pattern as ast-grep). No git library dependency.
- `C2` — No new npm dependencies. Use native Bun/Node APIs and spawned CLI tools.
- `C3` — All edges follow existing provenance model: source, confidence, evidence, content_hash, created_at.
- `C4` — Tree-sitter indexer changes must not break existing tests (68 test files). All current edge extraction behavior is preserved.
- `C5` — Co-change analysis must handle repos with no git history (new/uninitialized repos) gracefully — skip the stage, no errors.

## Open Questions

None.

## Recommended Direction

**Git co-change** should spawn `git log --name-only --format="%H %aI"` (or similar) to get commit-to-file mappings, then build a co-occurrence matrix of file pairs. Apply exponential decay weighting based on commit age, filter by minimum co-change count, and emit `co_changes_with` edges between the corresponding module nodes. Store the last-analyzed HEAD commit hash in `file_hashes` or a new metadata table to enable incremental runs.

**Edge case hardening** should be done entirely within `src/indexer/tree-sitter.ts` by extending the existing import/call extraction. Aliased imports need a local-name-to-original-name map so call extraction can look up aliases. Namespace imports need qualified call detection (`utils.foo()` → edge to `foo` in `utils` module). Re-exports need a new tree-sitter query for `export { name } from "source"` patterns. Barrel file resolution chains re-export edges transitively. Dynamic imports are a simple pattern match on `import()` call expressions.

**Performance work** is moderate: add `performance.now()` timing around each stage in `pipeline.ts`, audit the SQLite schema for missing indexes (likely: edges by kind, nodes by name, compound indexes for common join patterns), and add a `getStatistics()` method to the graph store that queries counts and staleness.

## Testing Implications

- **Git co-change**: Test with a synthetic git repo (create temp dir, run `git init`, make commits with known file patterns, verify correct edges and weights). Test graceful handling of non-git directories.
- **Aliased imports**: Add test cases to existing `indexer-extract-file.test.ts` — `import { foo as bar }` followed by `bar()` should produce an edge to `foo`.
- **Namespace imports**: Test `import * as ns from "./mod"` + `ns.func()` → edge to `func`.
- **Re-exports**: Test `export { x } from "./other"` creates transitive edges. Test barrel files (index.ts re-exporting from submodules).
- **Dynamic imports**: Test `import("./mod")` creates a low-confidence import edge.
- **Pipeline timing**: Verify timing data is returned/emitted for each stage.
- **Statistics**: Test `getStatistics()` returns correct counts after indexing a known fixture.
- **Staleness**: Modify a file after indexing, verify it appears in staleness report.
- **SQLite indexes**: Verify with `EXPLAIN QUERY PLAN` that tool queries use indexes (or just verify indexes exist on expected columns).
