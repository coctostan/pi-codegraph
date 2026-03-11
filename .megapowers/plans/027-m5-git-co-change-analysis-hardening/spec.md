# Spec: 027-m5-git-co-change-analysis-hardening

## Goal

Add Stage 5 git co-change indexing to the pipeline (file-level `co_changes_with` edges derived from commit history) and harden the tree-sitter indexer to correctly handle aliased imports, namespace imports, re-exports, barrel files, and dynamic imports. Also add pipeline timing instrumentation, index statistics, staleness reporting, and ensure SQLite indexes cover all tool query patterns.

## Acceptance Criteria

**Git Co-Change Analysis (Stage 5)**

1. A new `src/indexer/git.ts` module exports a function that parses `git log` output (via spawned `git` CLI) to identify file pairs that frequently co-change within the same commits.

2. Co-change edges are emitted as `module → module` with kind `co_changes_with` and provenance source `git`.

3. Commit age weighting is applied so recent commits contribute more than old ones. The weighting function (e.g., exponential decay) uses commit author date relative to the analysis time.

4. Edge evidence includes: the co-change commit count, the computed recency-weighted score, and the time window analyzed (e.g., `"co_changes: 12, recency_score: 8.4, window: 365d"`).

5. A configurable minimum co-change threshold (default ≥ 2) prevents edges from being created for file pairs that only appeared in a single shared commit.

6. The co-change stage is wired into `pipeline.ts` as Stage 5, executing after coverage (Stage 4).

7. Co-change indexing is incremental: the last-analyzed HEAD commit hash is stored, and re-analysis is skipped when HEAD hasn't changed. On first run or after HEAD changes, all prior `co_changes_with` edges with provenance source `git` are cleared and rebuilt.

8. When the project directory is not a git repository (or has no commits), the co-change stage completes without error and without creating any edges.

**Edge Case Hardening (Tree-Sitter Indexer)**

9. Aliased imports (`import { foo as bar } from "./mod"`) are extracted with the original exported name (`foo`) as the edge target, not the local alias. Calls to `bar()` in the importing file resolve to edges targeting `foo` in the source module.

10. Namespace imports (`import * as utils from "./mod"`) are extracted. Qualified calls like `utils.helper()` produce edges targeting `helper` in the source module.

11. Re-exports (`export { foo } from "./bar"` and `export { foo as baz } from "./bar"`) create import edges from the re-exporting module to the source module's exported symbol, enabling transitive resolution.

12. Barrel file awareness: when a file re-exports symbols from submodules (as in `index.ts` files), the re-export edges created in AC 11 allow tool queries to trace through the barrel to the actual definition module.

13. Dynamic imports (`import("./mod")`) are extracted as import edges with confidence 0.3 (lower than static imports) to reflect that the target may be computed or conditional.

**Performance & Observability**

14. Each indexer stage (tree-sitter, LSP, ast-grep, coverage, git) has its wall-clock duration measured. The pipeline function returns stage timings as structured data (e.g., `{ timings: { "tree-sitter": 342, lsp: 1205, ... } }` in milliseconds).

15. The pipeline return value includes summary counts: files indexed, files skipped, files removed, and errors encountered (this already exists but is verified to still hold).

16. SQLite indexes are added to cover tool query patterns. At minimum: an index on `nodes(name)` for `findNodes`/`symbol_graph`, and a compound or single index on `edges(kind)` for `graph_query` kind filters. Existing indexes (`nodes(file)`, `edges(source)`, `edges(target)`) are preserved.

17. A `getStatistics()` method is added to the `GraphStore` interface, returning: node count grouped by kind, edge count grouped by kind and provenance source, and file count (total tracked, indexed, stale).

18. Staleness detection: `getStatistics()` identifies stale files (where the stored content hash no longer matches the file on disk) and reports the count. A file is stale when its content has changed since last indexing.

**Regression Safety**

19. All existing tree-sitter indexer tests continue to pass after edge case hardening changes. The aliased import test in `indexer-extract-file.test.ts` is updated to reflect the new correct behavior (edge resolves to the original name).

## Out of Scope

- **Symbol-level co-change analysis** (D1) — only file-level (module→module) edges. Agents can combine co-change with `symbol_graph` to bridge to symbols.
- **Formal benchmark suite** (D2) — timing instrumentation is added but no regression benchmarks or performance thresholds.
- **Documentation** (D3) — tool usage guide, rule authoring guide deferred.
- **Type-only import distinction** (O2) — `import type { T }` not distinguished from value imports in this slice.
- **Last-indexed timestamp and total duration in statistics** (O3) — statistics cover counts and staleness only.
- **Sample commit SHAs in co-change evidence** (O1) — evidence includes counts and scores but not individual SHA references.

## Open Questions

None.

## Requirement Traceability

- `R1 → AC 1`
- `R2 → AC 2`
- `R3 → AC 3`
- `R4 → AC 4`
- `R5 → AC 5`
- `R6 → AC 6`
- `R7 → AC 7`
- `R8 → AC 9`
- `R9 → AC 10`
- `R10 → AC 11`
- `R11 → AC 12`
- `R12 → AC 13`
- `R13 → AC 14`
- `R14 → AC 16`
- `R15 → AC 17`
- `R16 → AC 18`
- `O1 → Out of Scope`
- `O2 → Out of Scope`
- `O3 → Out of Scope`
- `D1 → Out of Scope`
- `D2 → Out of Scope`
- `D3 → Out of Scope`
- `C1 → AC 1 (git CLI constraint)`
- `C2 → AC 1 (no new deps constraint)`
- `C3 → AC 2, AC 4 (provenance model constraint)`
- `C4 → AC 19`
- `C5 → AC 8`
