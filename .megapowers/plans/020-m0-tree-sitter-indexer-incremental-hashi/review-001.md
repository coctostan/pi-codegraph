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
  - 7
  - 8
  - 9
  - 10
  - 6
approved_tasks:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 7
  - 8
  - 9
  - 10
needs_revision_tasks:
  - 6
---

### Per-Task Assessment

### Task 1: Add tree-sitter dependencies [no-test] — ✅ PASS
No issues. Valid no-test justification (dependency/config-only change) and includes concrete verification commands.

### Task 2: Create extractFile() result shape with module node + content hash — ✅ PASS
Covers module-node/id/hash baseline and uses the current codebase API shape (`GraphNode`, `GraphEdge`, `nodeId`).

### Task 3: Extract function declarations and arrow-function assignments as function nodes — ✅ PASS
Test and implementation align with existing types and tree-sitter entrypoint strategy.

### Task 4: Extract class and interface declarations as nodes — ✅ PASS
Implementation approach is consistent with Task 3 structure and current AST-walk helpers.

### Task 5: Extract named/aliased/default import statements as imports edges — ✅ PASS
Covers named, aliased, and default imports with required tree-sitter provenance fields.

### Task 6: Extract calls edges for bare function calls and constructor calls (ignore method calls) — ❌ REVISE
- **Step 3 is incomplete and not self-contained.** It contains prose (“implement scope-aware traversal...”) instead of full implementation code.
- This fails the TDD completeness requirement for exact implementation instructions and risks incorrect call-source attribution.
- Replace Step 3 with concrete code for:
  1) parse-error short-circuit (`tree.rootNode.hasError()`),
  2) scope-aware call traversal,
  3) `call_expression`/`new_expression` handling restricted to identifier callees/constructors,
  4) explicit `tree-sitter` provenance (`confidence: 0.5`).

### Task 7: Add GraphStore.listFiles() for deletion detection in the indexer — ✅ PASS
API additions match existing `GraphStore`/`SqliteGraphStore` design and are correctly scoped.

### Task 8: Implement indexProject() to index .ts files and store hashes/nodes/edges — ✅ PASS
Uses correct store APIs and returns expected `IndexResult` shape.

### Task 9: Add incremental hashing: skip unchanged files and delete+reindex changed files — ✅ PASS
Ordering and dependencies are correct; logic aligns with current `GraphStore` contract.

### Task 10: Handle deleted files (removed count) and continue indexing when a file read fails — ✅ PASS
Covers deleted-file cleanup and per-file error continuation semantics.

### Missing Coverage
No acceptance criteria gaps found. All ACs 1–28 are addressed across Tasks 1–10.

### Verdict
**revise** — Task 6 must be made fully executable and self-contained before implementation starts.

`revise-instructions-1.md` has been written with a concrete replacement implementation pattern for Task 6.
