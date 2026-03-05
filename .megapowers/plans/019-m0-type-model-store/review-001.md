---
type: plan-review
iteration: 1
verdict: revise
reviewed_tasks:
  - 1
  - 2
  - 3
  - 4
approved_tasks: []
needs_revision_tasks:
  - 1
  - 2
  - 3
  - 4
---

### Per-Task Assessment

### Task 1: Type model: NodeKind, EdgeKind, ProvenanceSource, GraphNode, GraphEdge, nodeId — ❌ REVISE
- Fails **TDD Completeness**: only 3 steps; required 5-step flow is missing.
- Step 1 does not include full test code (it describes tests but does not provide executable test content).
- Step 2 is missing a specific expected failure message tied to the command output.
- Step 3 does not include full implementation code (only bullet points).
- Step 5 full-suite verification command is missing.

### Task 2: GraphStore interface: NeighborOptions, NeighborResult, all method signatures — ❌ REVISE
- Fails **TDD Completeness** for same reasons as Task 1 (3 steps instead of 5, no full code in Step 1/3, no explicit Step 5 full-suite run).
- Fails **Self-Containment**: Step 1 says to edit `test/graph-types.typecheck.ts` but that file is not listed in `files_to_modify` metadata.
- Expected RED output is not specific enough.

### Task 3: SqliteGraphStore: schema init, addNode/getNode, addEdge/getNeighbors, getNodesByFile — ❌ REVISE
- Fails **Granularity**: combines many behaviors/tests/implementations in one task (constructor, schema, nodes, edges, neighbors, filtering, default direction, file query, schema_version).
- Fails **TDD Completeness**: 3-step format only; missing full test code, exact RED output details, full implementation code, and Step 5 full suite.
- **Coverage risk for AC 23**: task uses `bun test` only; no explicit type-check step ensuring `SqliteGraphStore` structurally implements `GraphStore`.

### Task 4: SqliteGraphStore: deleteFile, setFileHash/getFileHash, close + persistence — ❌ REVISE
- Fails **Granularity**: includes multiple distinct behaviors (invalidation, file hash API, persistence lifecycle) in one task.
- Fails **TDD Completeness**: only 3 steps; no full test code or full implementation code blocks; no Step 5 full-suite command.
- Fails **Self-Containment** for persistence setup details (temp DB lifecycle/cleanup not specified concretely).

### Missing Coverage
- Acceptance Criterion **23** (`SqliteGraphStore implements GraphStore` structural check) is not reliably covered by the current commands because the relevant task relies on `bun test` only. Add explicit `bun run check` coverage (or equivalent compile-time assertion) in a task that implements `SqliteGraphStore`.

### Verdict
- **revise** — Tasks need restructuring for 5-step TDD completeness and finer granularity before implementation is safe/executable.
