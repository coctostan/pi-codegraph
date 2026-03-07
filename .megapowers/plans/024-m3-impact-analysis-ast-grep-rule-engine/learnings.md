# Learnings — 024-m3-impact-analysis-ast-grep-rule-engine

- **BFS over DFS for traversal is cleaner for depth-tracking.** Collecting impact with BFS naturally yields the correct `depth` value per node and makes `maxDepth` enforcement trivial (check before enqueue). A DFS approach would require tracking depth on the call stack or as mutable state.

- **`from_context: enclosing_function` requires a tiebreak rule.** Multiple functions in the same file can have identical or overlapping line ranges (e.g. two helpers defined at the same start line). Sorting by span ascending, then `start_line`, then `id` lexicographically produced deterministic, test-verifiable behavior. Document tiebreak rules up front in specs to avoid retrofitting.

- **Same-file-only target lookup for `renders` edges is the right scoping for incremental correctness.** Cross-file component resolution would require tracking cross-file invalidation (i.e., when `Button.tsx` changes, re-scan every file that renders `Button`). That's a separate, harder problem. Keeping target lookup to `store.findNodes(name, match.file)` makes stale-edge cleanup straightforward.

- **Bun's `YAML.parse` is the right choice over a third-party YAML library, but it must be guarded.** `Bun.YAML.parse` is not available in Node runtimes. The test that patches `Bun.YAML = undefined` and expects a descriptive throw is an effective contract test that catches accidental Node migration early.

- **`sg run --json` is the correct subprocess interface.** The ast-grep CLI's `--json` flag produces structured output per match with `file`, `range`, and `metaVariables`. The `single` vs `multi` metavariable distinction (scalar captures vs variadic `$$$` captures) must be handled separately — the normalization step in `runScan` is important and worth unit-testing explicitly.

- **Stage 3 ordering matters: tree-sitter before ast-grep.** The Express test requires the `handler` node to already exist before `applyRoutesToMatches` tries to look it up with `store.findNodes`. Running tree-sitter extraction first, then LSP, then ast-grep is both the correct semantic order and matches the milestone design.

- **Pipeline's `store.deleteFile()` is the right cleanup hook, not a Stage 3–specific delete.** Introducing a separate "remove ast-grep edges before rescan" step would duplicate cleanup logic. Using `deleteFile` at the pipeline level means tree-sitter, LSP, and ast-grep edges for changed files are all removed atomically before any stage re-runs — simpler invariants, fewer edge cases.
