# Learnings — Issue 032

- **The simplest fix is sometimes the right one.** Removing three lines from `ensureIndexed()` (the `if (store.listFiles().length === 0)` guard) fixed the stale-DB bug completely. The incremental machinery already existed in `indexProject()` — the gate was just in the wrong place.

- **Shared resolver patterns prevent divergence.** Each tool having its own symbol-resolution logic created silent contracts that could drift independently. Extracting `resolveUniqueSymbol()` into a single module means future tools can't accidentally implement a fourth semantics for multi-match results.

- **Tagged union return types are better than booleans + nulls for resolution outcomes.** `{ kind: "not_found" | "ambiguous" | "unique" }` makes the caller explicitly handle every case. A `null` return (the old `resolveNode()` in `trace.ts`) collapsed two semantically distinct states into one, which was the root cause of the "not found" mistaken report.

- **Parser test coverage with a narrow example space creates blind spots.** All existing `parseWhere()` tests used double-quoted strings. The single-quote case wasn't adversarial — it's literally what a Cypher-familiar user would type first. A fuzz-style test pass or a "what would a user actually write?" review would have caught this at authoring time.

- **Bugfixes on shared hot-paths need cross-tool regression coverage.** The stale-indexing bug affected all five tools through the same `ensureIndexed()` call. The regression test only covers `symbol_graph`, which is correct for the test scope, but it's worth noting that a single behavioral test validates the entire change surface.

- **`collectImpact()` intentionally keeps its multi-seed semantics.** The fix deliberately leaves `collectImpact()` unchanged (it still aggregates from all matching node IDs when called directly). Only the user-facing `impact()` function checks for ambiguity first. This preserves backward compatibility for programmatic callers while fixing the agent-facing contract.

- **Unconditional indexing on every tool call adds latency but preserves correctness.** In practice, `indexProject()` returns immediately for unchanged files (just a hash comparison per file). The cost is proportional to the number of files checked, not re-indexed. For the typical workload this is negligible, but it's worth revisiting if the project grows to tens of thousands of files.
