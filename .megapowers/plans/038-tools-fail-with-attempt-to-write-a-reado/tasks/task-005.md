---
id: 5
title: Remove superseded bug-reproduction tests and verify full suite
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
no_test: true
files_to_modify:
  - test/readonly-graceful-degradation.test.ts
files_to_create: []
---

### Task 5: Remove superseded bug-reproduction tests and verify full suite [depends: 1, 2, 3, 4] [no-test]

**Justification:** The two "BUG REPRODUCED" tests were written during the reproduce phase to document the broken behavior. After Tasks 1-4, the bug is fixed and the behavior has changed — those tests either fail (they assert the old broken behavior) or are no longer meaningful. The new tests from Tasks 1-4 replace them as regression tests.

**Files:**
- Modify: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Make the change**

Remove these two tests from `test/readonly-graceful-degradation.test.ts`:

1. `"BUG REPRODUCED: indexProject crashes on readonly DB when LSP stage tries to write edges"` (around lines 150-190)
2. `"BUG REPRODUCED: extension execute() propagates readonly crash, user gets no results"` (around lines 193-260)

These are the tests that assert `expect(true).toBe(true)` or document that errors propagate. They are replaced by the fix-verification tests from Tasks 1-4.

**Step 2 — Verify**
Run: `bun test`
Expected: All tests pass. The final test file should have:
- 4 original evidence tests (writes fail, reads work, symbol_graph reads, graph_query reads)
- 4 fix-verification tests (ensureIndexed catches, lazy resolver, resolve_edge, trust header)
