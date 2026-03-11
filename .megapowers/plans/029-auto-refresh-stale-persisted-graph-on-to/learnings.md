# Learnings: #029 Auto-refresh stale persisted graph

- **Don't gate incremental logic with coarse checks.** `indexProject()` already had correct per-file change detection via SHA-256 hashing, but `ensureIndexed()` wrapped it in an all-or-nothing empty-DB guard. The incremental function's own skip logic was sufficient — the outer guard was redundant and harmful.

- **`[stale]` markers are a symptom, not the problem.** The output layer's staleness detection (`computeAnchor()`) was working correctly — the real issue was upstream: the index refresh was being skipped entirely. Always trace past the symptom.

- **Pre-committed fixes need TDD guard workarounds.** When the fix is already committed on the branch, the TDD guard's RED→GREEN cycle requires temporarily reverting the fix to demonstrate the test catches the bug. This is mechanically correct but awkward — worth noting for future validation-only tasks.

- **Incremental indexing is cheap enough to run unconditionally.** For 20-50 files, hash comparison is sub-millisecond. The "optimization" of skipping it was premature and caused a real bug. When the fast path is already fast, don't add gates around it.

- **All tool handlers shared the same entry point.** Because all 5 tools called `ensureIndexed()`, the single-line fix improved all of them uniformly. Centralizing the index-check was the right architectural choice — the bug was in the check's logic, not its placement.
