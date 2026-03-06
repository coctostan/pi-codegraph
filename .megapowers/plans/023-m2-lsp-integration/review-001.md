---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
approved_tasks: []
needs_revision_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
---

### Task 1: Add TsServerClient request API and lifecycle — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- Step 3 in `plan.md` assumes tsserver can be called with repo-relative paths like `src/consumer.ts`, but the rest of the codebase stores relative paths while tsserver typically expects/returns absolute paths. The task needs an explicit normalize-in / normalize-out contract.
- Startup failure / missing-tsserver behavior is not specified correctly. Task 4 assumes client construction throws, but Task 1’s implementation does not.
- Crash handling coverage is incomplete: the task checks rejection of a pending request but does not explicitly prove the next request respawns successfully.

### Task 2: Store tree-sitter call-site coordinates in calls evidence — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- Step 3 in `plan.md` is only a fragment (“replace these assignments”) rather than full, copy-pasteable implementation code.

### Task 3: Extend GraphStore with unresolved-edge queries and targeted edge deletion — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- Step 3 in `plan.md` is not full implementation code; it is a partial patch description for two files.

### Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- Graceful-degradation logic is incorrect. The task wraps `new TsServerClient(...)` in `try/catch`, but Task 1 does not start tsserver in the constructor, so the skip path will not work as written.
- The “preserves partial writes if tsserver crashes” test does not actually test a crash or partial preservation; it only covers the missing-tsserver case. AC27 is not properly covered.
- Step 3 relies on file-path matching that will fail unless TsServerClient normalizes tsserver response paths back to repo-relative paths.
- Granularity is too broad: one task/test covers unresolved resolution, confirmation, idempotence, missing-tsserver handling, and crash handling.

### Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- Step 3 is incomplete because it includes a comment telling the developer to update `src/index.ts` rather than providing the full code.
- The test/implementation pair depends on Task 4’s path-normalization and graceful-degradation behavior, which is currently underspecified.

### Task 6: Persist missing caller edges from LSP references when symbol_graph is invoked — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- Step 3 uses `client.references(node.file, node.start_line, 1)`. That is not a valid definition location in general because `GraphNode` does not store a symbol column. The task needs a concrete helper to compute the 1-based column from source text before calling tsserver.
- The test only checks that the second `symbol_graph` call still shows the enriched output. That does not prove AC24 (“does not re-query tsserver”); it only proves persisted output is visible. The task needs a graph-state assertion that no duplicate `lsp` edge is created on the second call.
- Step 3 again assumes `ref.file` can be passed directly to `store.getNodesByFile(...)`; that only works if path normalization is explicitly handled.

### Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries — ❌ REVISE
- The saved task file is not self-contained: it only has a summary, not the required 5-step TDD body.
- This task cannot work with the listed files. `src/tools/symbol-graph.ts` currently ignores `implements` edges, and `src/output/anchoring.ts` only renders Callers/Callees/Imports/Unresolved sections. A test expecting `RealWorker` / `implements` in output cannot pass without modifying those files and their tests.
- Step 3 again uses `implementations(node.file, node.start_line, 1)` without a real symbol column.
- The “second call” assertion only checks display count, not that the persisted `implements` edge count remains stable and no re-query/duplicate write occurs.

### Missing Coverage
- AC24 is only weakly covered. The plan checks repeated output, but it does not reliably prove that the second `symbol_graph` call avoids duplicate persisted edges / avoids repeat LSP work.
- AC27 is not actually covered by the current tests. The plan mentions mid-stage tsserver crash preservation, but no task currently contains a real crash-during-stage test.

### Overall
The plan has the right broad decomposition, but it is not yet executable. The saved task artifacts are summary-only instead of full task instructions, several Step 3 implementations are patch fragments rather than complete code, and there are correctness gaps around tsserver path normalization, symbol-column lookup for references/implementations, real crash handling coverage, and rendering `implements` edges in `symbol_graph`. See `revise-instructions-1.md` for exact fixes.
