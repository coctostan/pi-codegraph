# Learnings — #040

- **Internal marker nodes leak after generalization.** The old code only rendered `calls` and `imports`, so `__meta__` LSP marker nodes were invisible. Generalizing to all edge kinds exposed them. Always check for synthetic/internal nodes when widening a filter.
- **Signature changes and implementation changes can't always be separated into independent TDD tasks.** Changing `formatNeighborhood` from positional params to `NamedSection[]` (Task 1) required simultaneously updating `symbol-graph.ts` (Task 2) to avoid a broken intermediate state. Plan tasks that touch a shared interface should be co-implemented.
- **Bolt-on functions are a sign of missing generality.** `renderImplementationsSuffix` existed because the core loop only handled 2 of 8 edge kinds. The fix wasn't to add more bolt-ons — it was to generalize the core loop. This is a recurring pattern worth catching earlier.
- **Direction-aware titles are essential for agent comprehension.** Showing "Implemented By" vs "Implements" depending on which side you're querying makes the graph output immediately actionable without the agent needing to reason about edge direction.
- **Map-based bucketing with ordered drain is a clean pattern.** Bucket neighbors by title into a Map, drain known keys in a defined order, then append any remaining unknown keys. Simple, predictable, future-proof.
