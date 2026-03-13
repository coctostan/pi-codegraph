# Learnings — #034 Agent Reasoning Affordances

- **Provenance deduplication is non-obvious.** The graph can accumulate multiple edges between the same pair of nodes (different indexer runs, different provenance sources). Using `Set<nodeId>` for fan-in/out counting rather than `edges.length` was essential for spec correctness and discovered edge cases in existing test fixtures that had implicit duplicate edges.

- **`ALTER TABLE ADD COLUMN` + NULL coercion pattern works cleanly for additive schema migrations.** Adding `is_exported INTEGER` with a `catch`-swallowing approach and then coercing hydrated `NULL` to `false` via `Boolean(row.is_exported)` kept all existing tests green without a schema version bump or data migration script. Worth codifying as the project pattern for additive boolean flags.

- **Weakest-link chain confidence needs per-hop deduplication first.** The instinct was to propagate minimum confidence across the BFS path, but the first step is deduplicate inbound edges per caller/callee pair (keep highest confidence). Without that, repeated indexer runs create artificially low chain confidence because low-confidence tree-sitter edges survive alongside high-confidence LSP edges for the same pair.

- **Memoization across BFS traversal, ranking, and rendering pays off disproportionately.** Signal computation per node was fast in isolation but BFS fans out — the same hub node is reachable via many paths. Caching `computeBaseSignals(nodeId)` in a `Map` cut the 120-symbol benchmark from ~400ms to ~18ms. Always pre-plan a cache boundary when a per-node computation is called from a graph traversal.

- **Test fixture design for ranking tests needs deliberate asymmetry.** The initial ranking test fixture accidentally had all candidates with identical fan-in, making the sort comparator tests trivially true. Adding explicit asymmetry (one untested node, one with higher co-change, one deeper) uncovered a bug in the untested-before-tested comparator direction.

- **`is_exported` on `GraphNode` as optional (`?:`) was the right call.** Making it required would have broken all existing test fixtures that construct `GraphNode` literals directly. Optional with a `?? false` / `Boolean(...)` fallback everywhere is cleaner than a migration that touches every test.

- **Always-on annotations are easier to validate than toggle-controlled ones.** Having no parameter to control annotations meant every existing integration test line needed its regex updated to accept the new suffix, but it also meant there was no combinatorial test matrix. The cost of updating regexes once is lower than the ongoing cost of testing both modes.
