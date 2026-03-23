# Diagnosis

## Root Cause

`src/tools/graph-query.ts` line 31 uses a parameterless `catch {}` block, which discards the SQLite error thrown by `store.queryRows()`. The error object is never captured, so the user-facing message is hardcoded to the generic string `"failed to execute compiled query"`.

The outer catch (line 34) correctly captures the error parameter (`catch (error)`) and uses it. The inner catch does not.

## Trace

1. **Symptom:** `graphQuery()` returns `execution_error: failed to execute compiled query` with no detail
2. **Line 25:** `store.queryRows(compiled.sql, compiled.params)` throws when SQLite rejects the compiled SQL (e.g., `no such column: n0.nonexistent_column`)
3. **Line 31:** `catch {` — no error parameter, the thrown Error object is discarded
4. **Line 32:** Returns hardcoded generic message, never referencing the actual error

**Root cause is line 31:** the missing error parameter in the catch clause.

## Affected Code

- `src/tools/graph-query.ts` — lines 31-32 (inner catch block of `graphQuery()`)

## Pattern Analysis

**Working pattern (same file, outer catch, line 34):**
```typescript
} catch (error) {
  if (error instanceof GraphQueryError) {
    return prependTrustHeader(formatGraphQueryError(error), { stats });
  }
  throw error;
}
```
Captures the error, inspects it, uses it in the response.

**Broken pattern (inner catch, line 31):**
```typescript
} catch {
  return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
}
```
No error parameter — the actual SQLite diagnostic is thrown away.

The other 14 parameterless catches in the codebase are all in indexer/infrastructure code (git, lsp-resolver, coverage, pipeline, tsserver-client) where swallowing errors is intentional for graceful degradation. This is the only one in the tools layer that faces the agent and discards actionable diagnostic information.

## Risk Assessment

- **Scope of change:** Single catch block, one file, one function
- **What depends on it:** The `graphQuery` tool output is consumed by the agent. No other code parses the `execution_error:` prefix programmatically.
- **Risk:** Near zero. Adding the error message to the output string is purely additive. The `execution_error:` prefix is preserved.
- **Related bugs:** No other tool catch blocks exhibit this pattern — the other tools either surface errors or intentionally swallow them in non-user-facing contexts.

## Fixed When

Regression test sufficient. The existing failing test (`test/tool-graph-query-execution-error-detail.test.ts`) validates the fix: it asserts that `"no such column"` appears in the output when a query references a non-existent property.
