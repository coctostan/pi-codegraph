# Verification Report: #029 Auto-refresh stale persisted graph on tool invocation

## Test Suite Results

```
bun test v1.3.9
198 pass
0 fail
594 expect() calls
Ran 198 tests across 83 files. [6.86s]
```

## Bug Reproduction Confirmation

Ran the original reproduction steps (index → modify file → re-invoke tool) via direct script:

```
INITIAL anchor: src/graph/store.ts:30
AFTER CHANGE + RE-INDEX anchor: src/graph/store.ts:33
Contains [stale]: false
BUG NO LONGER OCCURS ✓
```

The fix (`ensureIndexed()` calling `indexProject()` unconditionally) enables incremental hash-based re-indexing on every tool call. After prepending 3 lines to shift `GraphStore` from line 30 → 33, the tool returns the correct updated anchor with no `[stale]` marker.

## Production Code Verification

`src/index.ts:77-79`:
```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  await indexProject(projectRoot, store);
}
```

No `store.listFiles().length === 0` guard present. Confirmed by direct file read.

## Per-Criterion Verification

### Criterion 1: Index a project, modify a file to shift line numbers, re-invoke tool
**Evidence:** `test/extension-stale-db-refresh.test.ts` does exactly this: indexes via `symbol_graph` tool, prepends 3 lines to `src/graph/store.ts`, resets store, re-invokes `symbol_graph`. Test passes (1 pass, 0 fail).
**Additional evidence:** Manual reproduction script confirmed the same flow end-to-end.
**Verdict:** pass

### Criterion 2: Assert result contains updated line number (`:33:` not `:30:`)
**Evidence:** Test line 36: `expect(symbolGraphText).toContain("src/graph/store.ts:33:")` — passes. Manual script output: `AFTER CHANGE + RE-INDEX anchor: src/graph/store.ts:33`.
**Verdict:** pass

### Criterion 3: Assert result does NOT contain `[stale]`
**Evidence:** Test line 37: `expect(symbolGraphText).not.toContain("[stale]")` — passes. Manual script output: `Contains [stale]: false`.
**Verdict:** pass

## Overall Verdict
**pass**

All 3 acceptance criteria verified with both automated test evidence and manual reproduction. The bug (stale graph data on tool invocation when `.codegraph/graph.db` already exists) no longer occurs. Full test suite passes with 198/198 tests.
