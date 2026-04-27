## Goal
Distinguish “coverage status is unknown because coverage indexing has not produced data” from “coverage is known and this symbol has no covering test,” so agents do not misread blanket `[untested]` tags as meaningful test-quality signals.

## Mode
Direct requirements

The issue already defines the problem, affected files, desired store API, and acceptance criteria. The main work is capturing the intended semantics clearly before spec and implementation.

## Must-Have Requirements
R1. When coverage data has not been indexed for the graph, symbol signal tags must show `coverage-unknown` instead of `untested`.

R2. When coverage data has been indexed and a symbol has no outgoing `tested_by` edge, symbol signal tags must show `untested`.

R3. When a symbol has an outgoing `tested_by` edge, symbol signal tags must continue to show `tested`.

R4. `GraphStore` must expose a `hasCoverageData(): boolean` method.

R5. `SqliteGraphStore` must implement `hasCoverageData(): boolean`.

R6. The coverage indexing stage must persist graph-level coverage metadata/sentinel on successful coverage-stage execution.

R7. Signal computation must use graph-level coverage metadata before deciding whether a missing `tested_by` edge means `untested`.

R8. Existing signal output behavior unrelated to coverage status, such as roles, fan-in, fan-out, framework mediation, export status, and co-change score, must remain unchanged.

R9. Existing signal tests must continue to pass after being updated for the new coverage-state semantics.

## Optional / Nice-to-Have
O1. Use a generic metadata table rather than a one-off sentinel node if it keeps the store cleaner and supports future graph-level flags.

O2. Add a focused regression test showing that a freshly indexed graph with no coverage reports emits `coverage-unknown`.

## Explicitly Deferred
D1. Do not add a separate `runtime-covered` or `covered-but-not-by-test` signal in this issue.

D2. Do not redesign coverage parsing or test-trace construction beyond persisting and reading coverage-indexed state.

D3. Do not change the meaning of `tested_by` edges; they continue to represent test-backed coverage.

## Constraints
C1. The graph schema and store should stay simple and SQLite-backed.

C2. The change should be localized primarily to `src/graph/store.ts`, `src/graph/sqlite.ts`, `src/indexer/coverage.ts`, and `src/output/signals.ts`.

C3. Public tool behavior should remain backward-compatible except for replacing misleading `untested` tags with `coverage-unknown` when coverage state is unknown.

C4. Runtime-only execution without a `tested_by` edge must not be treated as `tested`.

C5. The implementation should avoid speculative expansion of the signal model during this slice.

## Open Questions
None.

## Recommended Direction
Add a graph-level coverage sentinel through the store abstraction, preferably using a small metadata table in SQLite. The store API should expose only the behavior needed by callers: `hasCoverageData(): boolean`, plus an internal/public method for the coverage stage to mark coverage as indexed if required by the implementation.

Update `runCoverageIndexStage` so that successful execution records the sentinel. This should happen when the coverage stage successfully runs, even if it produces zero `tested_by` edges, because zero edges is the state we need to distinguish from “coverage was never configured/indexed.”

Update `NodeSignals` or its formatting path so signal rendering can distinguish three states: tested, untested with known coverage data, and coverage unknown. Keep the existing `tested: boolean` behavior if possible, but add the minimum additional field needed to format tags and impact coverage text correctly.

Tests should pin the two key cases: no sentinel means `coverage-unknown`; sentinel present plus no `tested_by` means `untested`. Existing tests that construct stores manually may need to mark coverage indexed when they expect `untested`.

## Testing Implications
- Add or update unit tests for `SqliteGraphStore.hasCoverageData()`.
- Add coverage-stage tests proving successful coverage indexing records the sentinel.
- Add signal tests for `coverage-unknown` when the sentinel is absent.
- Add signal tests for `untested` when the sentinel is present but no `tested_by` edge exists.
- Run `bun test` and `bun run check`.
