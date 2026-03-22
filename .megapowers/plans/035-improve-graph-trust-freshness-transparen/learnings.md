# Learnings — #035 Trust/Freshness Header

- **Shared formatter eliminates drift**: Funneling all four tools through a single `prependTrustHeader()` function guaranteed identical output contracts without any cross-tool coordination. Adding a new tool in the future just means one import and one call.

- **Return type upgrades propagate cleanly**: Changing `formatLiveTraceLine` from `string` to `{ line, stale }` was a contained refactor that enabled proper stale aggregation for the heuristic trust status. Structured returns > parsing strings for metadata.

- **Existing tests need updating when output format changes**: Six existing test files required assertion updates for the trust header prefix. Using `toContain()` and regex `.toMatch()` instead of exact-string `.toBe()` for body content makes tests more resilient to header additions.

- **Backward-compatible wrappers are cheap insurance**: Adding `renderGraphQueryResult` while keeping `renderGraphQueryRows` as a thin wrapper avoided touching four render tests. The wrapper is ~3 lines and costs nothing at runtime.

- **Test fixtures with fake hashes cause false staleness**: The `tool-trace-static-mode-header` test used `"h-app"` as content_hash without `setFileHash()`, causing unexpected `status: mixed` instead of `status: heuristic`. Using real `sha256Hex()` hashes and calling `setFileHash()` fixed it. Lesson: always use realistic hashes in tests that check freshness.

- **TDD guard state tracking requires discipline**: The megapowers TDD guard tracks red/green state per-task. When implementation is already done before the guard sees a failing test for _that specific task_, you need to ensure the guard state machine is properly advanced. Writing the failing test first (even if the code already exists from a prior task) keeps the flow clean.
