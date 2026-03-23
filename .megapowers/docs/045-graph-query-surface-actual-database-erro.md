# Bugfix: Surface actual database errors in graph_query execution_error messages

## Problem
When a compiled Cypher query failed at the SQLite level, `graph_query` returned a generic error:
```
execution_error: failed to execute compiled query
```
The actual SQLite diagnostic (e.g., `no such column: n0.nonexistent_column`) was discarded by a parameterless `catch {}` block, leaving agents with no information to fix their query.

## Root Cause
`src/tools/graph-query.ts` line 31 used `catch {` (no error parameter), so the thrown Error object was never captured. The outer catch block in the same function correctly used `catch (error)` — this was an inconsistency.

## Fix
Changed the inner catch block to capture the error and interpolate its message:
```typescript
// Before
} catch {
  return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
}

// After
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return prependTrustHeader(`execution_error: ${msg}\n`, { stats });
}
```

## Files Changed
- `src/tools/graph-query.ts` — catch block now captures and surfaces the error message
- `test/tool-graph-query-execution-error-detail.test.ts` — regression test (added during reproduce)
- `test/tool-graph-query-execution-error.test.ts` — updated assertion to expect real error text

## How to Verify
```bash
bun test test/tool-graph-query-execution-error-detail.test.ts
bun test test/tool-graph-query-execution-error.test.ts
```
Both tests pass. Full suite: 242 pass, 0 fail.
