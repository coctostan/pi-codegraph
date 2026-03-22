# Feature: Refine graph_query for agent usability

## Summary

Improved the `graph_query` Cypher-subset tool so coding agents can recover from errors, search symbols by substring, and discover the supported query syntax from the tool description.

## Motivation

When agents issued unsupported or malformed queries, `graph_query` returned bare error messages with no guidance on how to fix them. Agents also couldn't search for symbols by partial name — only exact equality was supported. The tool description gave no query examples, forcing agents to guess syntax.

## What Changed

### Error recovery suggestions
Every `GraphQueryError` now carries an optional `suggestion` field. When `graph_query` rejects a query, the output includes a `try instead:` line with a concrete working query the agent can copy-paste. This covers:
- Unsupported forms: OPTIONAL MATCH, COUNT, ORDER BY, mutations, variable-length paths
- Parse errors: invalid WHERE predicates
- Validation errors: invalid projection properties

### Substring and prefix search
WHERE clauses now support two new operators:
- `CONTAINS` — e.g., `WHERE n.name CONTAINS "Handler"` → compiled to `LIKE '%Handler%'`
- `STARTS WITH` — e.g., `WHERE n.name STARTS WITH "get"` → compiled to `LIKE 'get%'`

All values are parameterized (no string interpolation into SQL).

### Edge alias WHERE predicates
WHERE predicates now correctly resolve against edge aliases, not just node aliases. `WHERE e.evidence = "ref"` compiles to `e0.evidence = ?` instead of the previous `undefined.evidence = ?`.

### Discoverable examples
The `graph_query` tool description now includes 5 working example queries covering single-node match, traversal, equality WHERE, CONTAINS WHERE, and LIMIT.

## Files Changed

| File | Change |
|------|--------|
| `src/tools/graph-query-parser.ts` | `GraphQueryError.suggestion`, `formatGraphQueryError()`, suggestions on throw sites, `CONTAINS`/`STARTS WITH` parsing |
| `src/tools/graph-query-compiler.ts` | CONTAINS → `LIKE %val%`, STARTS WITH → `LIKE val%`, edge alias resolution in WHERE |
| `src/tools/graph-query.ts` | Use `formatGraphQueryError` for error rendering |
| `src/index.ts` | 5 example queries in tool description |

## Tests Added

8 new test files (205 lines total) covering all new behaviors at parser, compiler, and integration levels. Full suite: 225 pass, 0 fail.
