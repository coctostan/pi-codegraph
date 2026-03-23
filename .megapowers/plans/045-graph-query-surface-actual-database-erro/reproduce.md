# Reproduction: graph_query discards SQLite error details

## Steps to Reproduce
1. Create a `SqliteGraphStore` instance
2. Run `graphQuery()` with a Cypher query that references a non-existent property: `MATCH (n) WHERE n.nonexistent_column = "test" RETURN n`
3. The query compiles to valid SQL (`SELECT ... FROM nodes n0 WHERE n0.nonexistent_column = ?`) but fails at the SQLite level
4. Observe the output

## Expected Behavior
The `execution_error` message should include the actual SQLite error:
```
execution_error: no such column: n0.nonexistent_column
```

## Actual Behavior
The error is completely generic with no diagnostic information:
```
execution_error: failed to execute compiled query
```

The full output:
```
## Trust
status: fresh
evidence: none  stale-files: 0/0
execution_error: failed to execute compiled query
```

## Evidence

The catch block in `src/tools/graph-query.ts:31-32` discards the error:
```typescript
} catch {
  return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
}
```

The actual SQLite error (confirmed by catching it directly) is:
```
no such column: n0.nonexistent_column
```

This is surfaced by SQLite's `bun:sqlite` driver but the parameterless `catch` block throws it away.

## Environment
- Bun v1.3.11 (macOS arm64)
- pi-codegraph (current HEAD on fix/045 branch)

## Failing Test
`test/tool-graph-query-execution-error-detail.test.ts`

```typescript
test("graphQuery surfaces actual SQLite error in execution_error message", () => {
  // ... setup ...
  const output = graphQuery({
    query: 'MATCH (n) WHERE n.nonexistent_column = "test" RETURN n',
    store,
    projectRoot,
  });
  expect(output).toContain("execution_error:");
  expect(output).toContain("no such column");  // FAILS — gets generic message instead
});
```

Test output:
```
error: expect(received).toContain(expected)

Expected to contain: "no such column"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nexecution_error: failed to execute compiled query\n"
```

## Reproducibility
Always — 100% reproducible with any query that compiles to invalid SQL.
