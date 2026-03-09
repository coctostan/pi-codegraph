## Task 13: Validate alias references in graph queries

Step 3 changes `parseReturns` signature to `(returnClause, nodeAliases, edgeAliases)` but does not update `parseGraphQuery()` call sites. That will not compile once this change is applied.

Update Step 3 to include call-site wiring in `parseGraphQuery()`.

Required shape:

```ts
const nodeAliases = new Set([left.alias]);
returns: parseReturns(returnClause, nodeAliases, new Set<string>()),
```

and for traversal:

```ts
const nodeAliases = new Set([left.alias, right.alias]);
const edgeAliases = new Set<string>();
if (edge.alias) edgeAliases.add(edge.alias);
returns: parseReturns(returnClause, nodeAliases, edgeAliases),
```

## Task 14: Reject OR predicates in graph query WHERE clauses

Step 3 currently changes `parseWhere` to require a second parameter (`boundAliases`) but does not show any caller changes and does not use the parameter. This creates a signature mismatch risk.

Keep this task minimal for AC28 only: preserve the existing `parseWhere` signature and add only the OR guard.

Use:

```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError("unsupported_error", "OR is not supported");
  }
  // existing AND/equality parsing continues
}
```

## Task 19: Reject RETURN clause without projections

Step 3 is not self-contained (`// existing split logic continues...`). The task must provide complete compilable code.

Replace Step 3 with a full `splitClauses()` implementation, including the empty-RETURN check and existing MATCH/RETURN extraction logic.

Minimum required check:

```ts
if ((normalized.match(/\bRETURN\b/gi) ?? []).length !== 1 || /\bRETURN\s*$/i.test(normalized)) {
  throw new GraphQueryError("parse_error", "query must contain exactly one RETURN clause");
}
```

and include the rest of the function body through `return { matchClause, whereClause, returnClause, limitClause };`.

## Task 22: Reject OPTIONAL MATCH

Step 2 is too vague (`Expected: FAIL`). Add the concrete expected failing output so TDD is executable.

Use:

`Expected: FAIL — parseGraphQuery currently throws parse_error (expected MATCH ... RETURN ...) instead of unsupported_error (OPTIONAL MATCH is not supported)`

## Task 23: Reject aggregation in graph queries

Step 2 is too vague (`Expected: FAIL`). Add concrete failure text.

Use:

`Expected: FAIL — query currently reaches generic parse/validation path instead of unsupported_error: aggregation is not supported`

## Task 24: Reject ORDER BY in graph queries

Step 2 is too vague (`Expected: FAIL`). Add concrete failure text.

Use:

`Expected: FAIL — parser currently accepts/defers ORDER BY and does not return unsupported_error: ORDER BY is not supported`

## Task 25: Reject mutating Cypher queries

Step 2 is too vague (`Expected: FAIL`). Add concrete failure text.

Use:

`Expected: FAIL — parser currently returns parse_error for CREATE query instead of unsupported_error: mutating queries are not supported`

## Task 26: Reject variable-length paths

Step 2 is too vague (`Expected: FAIL`). Add concrete failure text.

Use:

`Expected: FAIL — parser currently returns parse_error for MATCH (a)-[*]->(b) RETURN a instead of unsupported_error: variable-length paths are not supported`
