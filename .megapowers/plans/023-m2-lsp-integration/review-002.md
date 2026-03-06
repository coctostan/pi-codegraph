---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 2
  - 3
  - 1
  - 4
  - 5
  - 6
  - 7
approved_tasks:
  - 2
  - 3
needs_revision_tasks:
  - 1
  - 4
  - 5
  - 6
  - 7
---

### Per-Task Assessment

### Task 1: Add `TsServerClient` request API and lifecycle — ❌ REVISE
- The proposed API does not match AC1: it requires `new TsServerClient(tsserverPath, projectRoot)` instead of lazily locating `node_modules/.bin/tsserver` in the project and falling back to global `tsserver`.
- Step 1 hard-codes `/opt/homebrew/bin/tsserver`, which is not portable and will fail on non-macOS/CI environments.
- The task claims coverage for idle shutdown, pending rejection on crash, per-request timeout, queue serialization, and shutdown cleanup, but Step 1 does not actually test AC2, AC5, AC6, AC7, or AC8.
- Step 3 uses a default timeout of `15_000`, but AC6 requires a default of `5_000`.
- Step 3 has no actual one-at-a-time request queue; a `pending` map is not the same thing as serializing concurrent requests.
- Granularity is too large: this is multiple behaviors and APIs bundled into one task.

### Task 2: Store tree-sitter call-site coordinates in `calls` evidence — ✅ PASS
No issues.

### Task 3: Extend `GraphStore` with unresolved-edge queries and targeted edge deletion — ✅ PASS
No issues.

### Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges — ❌ REVISE
- Missing AC20 coverage: there is no test or implementation path for existing tree-sitter `calls` edges that already point to real nodes and need to be confirmed/upgraded to `lsp` provenance.
- Step 3 uses confidence `0.95`, but AC18/AC20 require `0.9`.
- The unresolved-edge resolution logic matches target nodes by `file + start_line` only; that is too loose for correctness. It should use the parsed evidence name as well.
- The task text says “unresolved and confirmed call edges,” but the actual test plan only exercises unresolved edges.

### Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes — ❌ REVISE
- Step 3 changes `indexProject()` to async, but the existing tests already in `test/indexer-index-project.test.ts` are still written synchronously. The appended test alone is not enough; the earlier tests would need to be rewritten to `await indexProject(...)`.
- Step 3 constructs `TsServerClient` with `process.env.TSSERVER_PATH ?? "tsserver"`, which still does not satisfy AC1’s local-then-global lookup behavior.
- Coverage is incomplete for the pipeline integration itself: the task does not add a test proving the LSP stage actually runs after tree-sitter and upgrades an unresolved edge during `indexProject()`.

### Task 6: Persist missing caller edges from LSP references when `symbol_graph` is invoked — ❌ REVISE
- The cache guard is incorrect. Skipping `references()` whenever *any* inbound `lsp` call edge exists will miss additional callers, especially after Task 4 eagerly resolves some callers already. AC22/AC24 need an explicit persisted “resolved” marker, not a heuristic based on edge existence.
- Step 3 uses confidence `0.95`, but AC22 requires `0.9`.
- There is no test for filtering out self-references/definition references, so the proposed implementation can create a self-call edge.
- The task modifies `src/index.ts`, but Step 1 only tests the resolver helper directly. There is no tool-level test proving the `symbol_graph` handler actually invokes the resolver and persists the new edges.

### Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries — ❌ REVISE
- Same cache issue as Task 6: skipping `implementations()` whenever any inbound `lsp` `implements` edge exists can suppress discovery of additional implementors. AC23/AC24 need an explicit persisted “resolved” marker.
- Step 3 uses confidence `0.95`, but AC23 requires `0.9`.
- The task changes `src/index.ts`, `src/tools/symbol-graph.ts`, and `src/output/anchoring.ts`, but the tests do not exercise the actual `symbol_graph` tool path for an interface. A tool-path integration test is needed.

### Missing Coverage
- AC1 is not fully covered as written: no task concretely tests or implements “locate `node_modules/.bin/tsserver` in the project, then fall back to global `tsserver`.”
- AC20 is not covered by any task in executable detail: no task currently tests/implements upgrading an already-resolved tree-sitter `calls` edge to `lsp` provenance after confirming the target with `definition()`.

### Verdict
- **revise** — Tasks 1, 4, 5, 6, and 7 need changes for API correctness, lifecycle coverage, pipeline integration, and cache correctness.
