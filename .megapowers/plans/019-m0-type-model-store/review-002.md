---
type: plan-review
iteration: 2
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 4
  - 6
  - 7
  - 8
  - 9
  - 3
  - 5
approved_tasks:
  - 1
  - 2
  - 4
  - 6
  - 7
  - 8
  - 9
needs_revision_tasks:
  - 3
  - 5
---

### Task 1: Type model: define unions/interfaces and nodeId helper — ✅ PASS
No issues. 5-step TDD is complete and AC 1–10 are directly exercised with compile-time assertions.

### Task 2: GraphStore contract: NeighborOptions, NeighborResult, and method signatures — ✅ PASS
No issues. Contract shape matches `src/graph/store.ts` expectations and AC 11–21 are explicitly mapped.

### Task 3: SqliteGraphStore bootstrap: constructor default, schema init, and schema_version — ❌ REVISE
- **Step 1 (typecheck block) causes duplicate import risk**: appending `import type { GraphStore } ...` again to `test/graph-types.typecheck.ts` conflicts with Task 2’s existing `GraphStore` import.
- **AC 43 is not fully asserted**: schema test checks `version=1` via `LIMIT 1`, but does not verify the table has **exactly one row**.

### Task 4: SqliteGraphStore nodes: addNode/getNode with upsert semantics — ✅ PASS
No issues. TDD steps are concrete and implementation uses correct Bun SQLite API.

### Task 5: SqliteGraphStore edges: addEdge/getNeighbors with direction and kind filters — ❌ REVISE
- **AC 30 gap in Step 1 test**: criterion requires `getNeighbors(nodeId, { kind: 'imports' })` (kind-only options). Current test only checks kind filtering with `direction: 'in'`, so the exact required API call is not validated.

### Task 6: SqliteGraphStore file query: getNodesByFile — ✅ PASS
No issues.

### Task 7: SqliteGraphStore invalidation: deleteFile removes file nodes and touching edges — ✅ PASS
No issues.

### Task 8: SqliteGraphStore file hash API: getFileHash/setFileHash — ✅ PASS
No issues.

### Task 9: SqliteGraphStore lifecycle: close() and reopen persistence — ✅ PASS
No issues.

### Missing Coverage
- No fully unassigned ACs; however, **AC 43** and **AC 30** are not yet fully validated by the current task test code details (see Tasks 3 and 5).
