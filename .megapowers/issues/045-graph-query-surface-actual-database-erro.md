---
id: 45
type: bugfix
status: in-progress
created: 2026-03-23T12:36:08.141Z
priority: 2
---
# graph_query: surface actual database error in execution_error messages

## Observed behavior

When a compiled Cypher query fails at the SQLite level, the tool returns:
```
execution_error: failed to execute compiled query
```

No indication of what went wrong — missing column? type mismatch? syntax error in compiled SQL? The agent's only recourse is to blindly try different query structures.

## Root cause

`src/tools/graph-query.ts:31-32`:

```typescript
} catch {
  return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
}
```

The `catch` block has no error parameter — the actual database error is discarded entirely.

## Expected behavior

Capture and include the error message:

```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  return prependTrustHeader(`execution_error: ${msg}\n`, { stats });
}
```

This gives agents actionable diagnostic information to fix their query. The SQLite error messages are generally clear and safe to surface (e.g., "no such column: n0.nonexistent").

## Files involved

- `src/tools/graph-query.ts` — catch block at line 31-32
