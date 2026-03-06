# Revision instructions — iteration 1

All 7 saved task files under `.megapowers/plans/023-m2-lsp-integration/tasks/` are currently summary-only. In revise mode, update each task with the full 5-step body (full test code, exact failing command/message, full implementation code, pass command, full-suite command). Right now the task files are not self-contained enough for implementation.

In addition to expanding the task bodies, make the following task-specific corrections.

## Task 1: Add TsServerClient request API and lifecycle

1. **Do not plan around raw relative paths in tsserver requests/responses.**
   - The codebase stores graph files as project-root-relative POSIX paths like `src/a.ts` (`src/indexer/pipeline.ts`, `src/tools/symbol-graph.ts`).
   - Real tsserver requests should use absolute file paths, and tsserver responses are typically absolute too.
   - Revise the task so `TsServerClient` converts incoming repo-relative paths to absolute before sending requests, then normalizes returned file paths back to project-root-relative POSIX paths before returning `{ file, line, col }`.
   - The tests in Step 1 can keep asserting `src/api.ts`, but only if Step 3 explicitly shows the normalization helpers.

2. **Add explicit unavailable-tsserver coverage here, not only later.**
   - Task 4 currently assumes `new TsServerClient(...)` throws when tsserver is unavailable, but the Task 1 implementation does not do that.
   - Add a Task 1 test that constructs the client with a missing `tsserverPath` and verifies the first request rejects with a deterministic startup error such as:
     - `TsServer failed to start: <path>`
   - Then make Step 3 show how startup failure is surfaced to callers.

3. **Use Bun-compatible timer types in the code sample.**
   - The current Step 3 uses `Timer`; use `ReturnType<typeof setTimeout>` instead.

4. **Make crash/respawn behavior precise.**
   - The current test only checks that a pending request rejects after `SIGKILL`. Add the next line that proves AC4 by issuing another request and expecting it to succeed after the crash.

## Task 2: Store tree-sitter call-site coordinates in calls evidence

1. Expand the task file to the full 5-step format.
2. Step 3 currently shows only two replacement snippets. Make it fully copy-pasteable by including the exact helper and the exact two provenance blocks inside `src/indexer/tree-sitter.ts`.
3. Keep the evidence format tied to the current AST API:
   - `callee.startPosition.row + 1`
   - `callee.startPosition.column + 1`
   - same for `ctor`

## Task 3: Extend GraphStore with unresolved-edge queries and targeted edge deletion

1. Expand the task file to the full 5-step format.
2. Step 3 is currently fragmentary. Replace it with full copy-pasteable method bodies for `src/graph/store.ts` and `src/graph/sqlite.ts`.
3. Keep the SQL aligned with the existing schema in `src/graph/sqlite.ts`:
   - edge columns are `source, target, kind, provenance_source, confidence, evidence, content_hash, created_at`
4. In the test, assert ordering explicitly for `getEdgesBySource()` since the implementation sorts by `created_at`.

## Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges

1. Expand the task file to the full 5-step format.
2. **Fix the graceful-degradation strategy.**
   - The current Step 3 wraps `new TsServerClient(...)` in `try/catch`, but Task 1’s client constructor does not start tsserver.
   - Revise the task so `runLspIndexStage()` treats startup failure from the first actual request as the skip condition.
   - Example shape:
     ```ts
     try {
       const location = await client.definition(sourceNode.file, parsed.line, parsed.col);
       // ...
     } catch (error) {
       if (isTsServerUnavailable(error)) return;
       // partial-results behavior for crash/timeouts is handled per-edge
     }
     ```
3. **Actually test AC27 (partial results on crash).**
   - The current second test only checks the “missing tsserver” path.
   - Add a second unresolved edge and force a crash after the first edge resolves, then assert:
     - the first resolved `lsp` edge remains in the store
     - the remaining unresolved edge is still present
     - the stage completes without throwing
4. **Do not rely on absolute-path mismatches.**
   - When mapping a `definition()` result back to stored nodes, either use the normalized relative path returned by `TsServerClient` (preferred) or explicitly convert with `relative(projectRoot, location.file)` before calling `store.getNodesByFile(...)`.
5. Step 3 currently imports `nodeId` but does not use it. Remove unused code in the revised task body.

## Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes

1. Expand the task file to the full 5-step format.
2. Step 3 is not self-contained because it says:
   - `// in src/index.ts, update ensureIndexed + both tool handlers to await indexProject`
   Replace that comment with the full revised `ensureIndexed()` function and the exact updated `execute()` calls in `src/index.ts`.
3. The test should keep using the real `indexProject()` signature from the revised task. Because current production `indexProject()` is synchronous, Step 2’s expected failure should mention the real failure mode you expect after changing the test to `await indexProject(...)` (for example, the stale-edge assertion failing), not just a generic async mismatch.

## Task 6: Persist missing caller edges from LSP references when symbol_graph is invoked

1. Expand the task file to the full 5-step format.
2. **Do not use `col: 1` for `references()`.**
   - `GraphNode` currently stores only `start_line`, not a symbol column.
   - Revise this task to compute the symbol column from the source file text before calling tsserver, or add a helper in this task that scans the declaration line for the symbol name and returns the 1-based column.
   - The task must show that helper in Step 3.
3. **Normalize file paths before store lookups.**
   - `store.getNodesByFile(ref.file)` only works if `ref.file` is project-root-relative POSIX. Either depend on Task 1 normalization or show explicit normalization here.
4. **Strengthen the caching assertion.**
   - The current test only checks that the second call still returns the same output. That does not prove AC24.
   - Add an assertion on persisted graph state after the first call, then assert the second call does not create a duplicate `lsp` edge. For example, use `getSharedStoreForTesting()` from `src/index.ts` and assert the matching inbound `calls` edge count is still `1` after the second call.

## Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries

1. Expand the task file to the full 5-step format.
2. **This task is missing required file modifications.**
   - `src/tools/symbol-graph.ts` currently only formats `calls`, `imports`, and `__unresolved__` neighbors.
   - `src/output/anchoring.ts` only renders sections for `Callers`, `Callees`, `Imports`, and `Unresolved`.
   - A test expecting output to contain `implements` / `RealWorker` cannot pass without updating at least `src/tools/symbol-graph.ts`, and likely `src/output/anchoring.ts` plus its tests.
3. Revise the task to include those files explicitly:
   - Modify: `src/tools/symbol-graph.ts`
   - Modify: `src/output/anchoring.ts`
   - Modify/Test: `test/output-format-neighborhood.test.ts` or a symbol-graph tool test that proves the new section renders
4. **Do not use `col: 1` for `implementations()`.**
   - Reuse the same symbol-column helper from Task 6 when querying tsserver for an interface symbol.
5. **Strengthen the cache assertion.**
   - The current `RealWorker` count assertion does not prove tsserver was skipped.
   - Assert persisted `implements` edges in the graph store after the first call and assert the count is still `1` after the second call.
