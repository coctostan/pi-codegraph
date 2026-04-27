# Learnings — 082-signals-distinguish-coverage-not-configu

- **A single-row metadata sentinel beat a richer migration framework.** The temptation was to introduce a generic key/value bag for "graph-level facts" — but with one consumer (`coverageKnown`) and a tight spec, a dedicated table named `graph_metadata` with a single well-known key was strictly simpler and still future-compatible. Resist generalizing until a second consumer appears.

- **Capture-once-per-computer was the right place for the read.** Hoisting `const coverageKnown = store.hasCoverageData()` to `createSignalComputer` construction (one DB hit per tool call) instead of computing it per-node kept the existing memoization untouched and made AC 8 ("non-coverage signals must not change") fall out trivially. Per-node reads would have invited cache-key churn.

- **`CREATE TABLE IF NOT EXISTS` is not a no-op on read-only mounts.** SQLite still tries to write the journal even when the table already exists; on a chmod-`0o555` directory the constructor itself doesn't necessarily throw, but every read against a missing table does. The safe place to be defensive was the read site (`hasCoverageData()`), not the migration site — fixing the migration site would have changed semantics for fresh installs and still left the legacy-DB case broken.

- **Codex review caught a real backward-compat bug that targeted tests missed.** The change passed all 420 existing tests + 13 new tests, and only the parallel `codex review --base main` flagged the legacy-DB regression. Lesson: high-trust review tools earn their slot in the workflow even when verification looks green; the existing `readonly-graceful-degradation.test.ts` did not exercise the new code path because it predated the change. Adding a focused regression test (`test/graph-store-coverage-metadata-legacy-db.test.ts`) was straightforward once the failure mode was understood.

- **Test-fixture prep as an explicit task paid off.** Task 4 (mark coverage on every existing manual-store fixture) was a no-op against the old format functions but kept the suite green when Tasks 5/6 changed the formatter ladder. Splitting "prepare fixtures" from "change behavior" avoided a chain of confusing test failures during the refactor.

- **Task 7 was a regression-only task — and that was correct.** The end-to-end test had no production code change of its own; its job was to lock both the manually-populated and freshly-indexed paths into the suite. Worth keeping that pattern: regression-only tasks are valuable when an AC has multiple distinct entry points.

- **`impact` couldn't seed `SqliteGraphStore.hasCoverageData` as a symbol.** The verifier worked around it via direct source reads, which is fine for now. Long-term, M8-style interface-method extraction would resolve this — flag in the indexer roadmap.
