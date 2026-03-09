# Revise Instructions — Iteration 2

## Task 3: Classify parse validation and unsupported query errors

### Problem
Step 3 is a collection of code fragments — loose constants, modified function signatures, and unscoped statements — not a complete file or clear patch instructions. The implementer cannot determine how to integrate these into the existing `graph-query-parser.ts` from Task 2.

### Fix Required
Step 3 must provide the **complete** `src/tools/graph-query-parser.ts` file (since nearly every function changes signature or gains new logic). Specifically:

1. Add `NODE_FILTER_PROPERTIES`, `NODE_RETURN_PROPERTIES`, `EDGE_RETURN_PROPERTIES` as module-level constants.
2. Add `rejectUnsupported()` function.
3. Update `splitClauses()` to count MATCH/RETURN occurrences before regex extraction (also reject empty RETURN — `RETURN` followed by nothing).
4. Update `parseNodePattern()` to validate property names against `NODE_FILTER_PROPERTIES` — this means the function needs the alias available for error messages.
5. Update `parseWhere()` signature to `parseWhere(whereClause: string | undefined, boundAliases: Set<string>)` and validate aliases + property names.
6. Update `parseReturns()` signature to `parseReturns(returnClause: string, nodeAliases: Set<string>, edgeAliases: Set<string>)` and validate aliases + property names.
7. Update `parseGraphQuery()` to: call `rejectUnsupported(query)` first, build `nodeAliases`/`edgeAliases` sets, pass them to `parseWhere`/`parseReturns`, validate LIMIT > 0.

Also verify: The test case `MATCH (a {file: "src/a.ts"}) RETURN a` expects `validation_error: property "file" is not allowed on node alias "a"`. This error must come from `parseNodePattern` (inline filter validation), not `parseWhere`. Make sure `parseNodePattern` validates against `NODE_FILTER_PROPERTIES` and includes the alias in the error message (the alias is part of the node pattern so it's available).

Also verify: The `RETURN` with no items case (`MATCH (a) RETURN`) — the count check `(normalized.match(/\bRETURN\b/gi) ?? []).length !== 1` will see exactly 1 RETURN, but the regex `MATCH ... RETURN (content)` will fail to capture because there's nothing after RETURN. The `splitClauses` regex match will return null, hitting the "expected MATCH ... RETURN ..." error, not "query must contain exactly one RETURN clause". Either adjust the test expectation or add a separate check for empty RETURN content.

The `MATCH (a) RETURN a RETURN a.name` case: the count check will see 2 RETURNs and correctly throw. Good.

### Step 2 accuracy
The expected failure "FAIL — expected parseGraphQuery to throw" is plausible for the first test case that currently doesn't throw (some cases will already throw with wrong messages). This is acceptable as a general indicator.

## Task 8: Execute traversal queries without edge aliases

### Problem
Step 3 shows two regex comment snippets but not the complete modified functions. The implementer can't apply this.

### Fix Required
Step 3 must provide the complete modified functions from `graph-query-parser.ts`. Specifically:

1. **`parseEdgePattern`**: The incoming edge regex `^<-\[([^:\]]+)?(?::([^\]]+))?\]$` already matches `<-[:calls]`. But the traversal extraction regex in `parseGraphQuery` needs to match the full `(node)<-[edge]-(node)` pattern. The current regex from Task 2 is:
   ```
   /^(\([^\)]+\))\s*-(\[[^\]]*\]->|<\[[^\]]*\])\s*(\([^\)]+\))$/
   ```
   This has two problems:
   - The outgoing branch `-[...]->` works, but the incoming branch `<[...]` doesn't match `<-[...]` (missing the dash after `<`).
   - The Cypher incoming form is `(b)<-[:calls]-(a)`, which has a trailing `-` after `]` before `(a)`.

2. Provide the corrected traversal regex. Something like:
   ```
   /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)\s*(\([^\)]+\))$/
   ```
   And adjust the edge pattern extraction to pick the right capture group.

3. Show the complete `parseGraphQuery` function with the fix integrated, or at minimum show the exact regex replacement with before/after and which line it applies to.

4. Verify `parseEdgePattern` handles both forms:
   - `[r:calls]->` (outgoing with alias)
   - `<-[:calls]` followed by `-` (incoming without alias) — but `parseEdgePattern` receives just the bracket portion. Make sure the regex splitting correctly separates the bracket portion from the directional dashes.
