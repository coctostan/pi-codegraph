# Revise Instructions (Iteration 1)

## Task 1: Extract `is_exported` metadata from tree-sitter symbols

### Problem: Adding required `is_exported: boolean` to `GraphNode` will break all existing tests

The `GraphNode` interface is used in ~50+ test files that construct node literals. Adding a required `is_exported: boolean` field will cause TypeScript errors in every one of them, making Step 5 (`bun test` all passing) impossible without updating all those files.

### Fix

Make the field optional in `GraphNode`:

```typescript
export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  file: string;
  start_line: number;
  end_line: number | null;
  content_hash: string;
  is_exported?: boolean;  // optional, treat missing/undefined as false
}
```

Update Step 3 description to explicitly state:
- Add `is_exported?: boolean` (optional) to `GraphNode` in `src/graph/types.ts`
- The signal computer in Task 3 should treat `undefined`/missing as `false`
- This avoids needing to update every existing test file and keeps backward compatibility

This is the only approach that makes Step 5 work without a massive multi-file update.

## Task 2: Persist `is_exported` in SQLite nodes

### Minor clarification needed

Step 3 should note that `ALTER TABLE ADD COLUMN` yields NULL for existing rows, and the hydration code must coerce `null` → `false`:

```typescript
is_exported: Boolean(row.is_exported)  // NULL from DB → false
```

Add this to Step 3's description so the implementer doesn't miss it.

## Task 8: Cache signal computation for impact-scale performance

### Step 2 expected failure is unreliable

Step 2 says "confirm it fails on the timing threshold" but with only 120 symbols, `collectImpactDetails` from Task 4 may already complete well under 1 second even without memoization (SQLite in-memory is fast). This means Step 2 may not produce a RED state.

### Fix

Rewrite Step 2 to acknowledge this:

> Run `bun test test/tool-impact-performance.test.ts`. If the test passes immediately (timing under 1s without memoization), that's acceptable — the test serves as a regression guard. If it fails on timing, proceed to Step 3. Either way, Step 3 adds memoization to ensure the test remains green as the graph scales.

This makes the TDD flow honest about the possibility of an initial PASS while still delivering the required AC 14 regression test.
