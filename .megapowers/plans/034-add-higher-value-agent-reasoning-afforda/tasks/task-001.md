---
id: 1
title: Extract `is_exported` metadata from tree-sitter symbols
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/graph/types.ts
  - src/indexer/tree-sitter.ts
files_to_create:
  - test/indexer-exported-symbols.test.ts
---

**Files:**
- Create: `test/indexer-exported-symbols.test.ts`
- Modify: `src/graph/types.ts`
- Modify: `src/indexer/tree-sitter.ts`
- Test: `test/indexer-exported-symbols.test.ts`

**TDD Steps:**
1. Add a new extraction test that asserts exported function/class/interface/arrow symbols set `is_exported: true`, non-exported symbols set `false`, and the module node stays `false`.
2. Run `bun test test/indexer-exported-symbols.test.ts` and confirm it fails with an assertion showing `is_exported` is missing, e.g. `Expected path: [\"is_exported\"]` / `Received: undefined`.
3. Add `is_exported?: boolean` to `GraphNode` in `src/graph/types.ts` so existing tests that construct `GraphNode` literals stay valid, add a tree-sitter helper that detects `export_statement` ancestry, set `module.is_exported = false`, and pass the export bit into every symbol-producing `addNode(...)` call. Task 3 must treat missing/undefined `is_exported` as `false` when computing entry-point signals.
4. Re-run `bun test test/indexer-exported-symbols.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
