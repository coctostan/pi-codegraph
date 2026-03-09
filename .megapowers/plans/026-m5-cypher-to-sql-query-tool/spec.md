## Goal
Build a `graph_query` tool that accepts a strict, testable subset of Cypher, translates it to parameterized SQLite queries over the existing graph store, and returns anchored query results in the project’s standard text format. The goal is to give agents a flexible read-only query tool for graph exploration without implementing full Cypher or introducing unsafe, ambiguous, or hard-to-test behavior.

## Acceptance Criteria
1. The pi extension registers a `graph_query` tool that accepts a query string parameter.
2. When the `graph_query` tool runs against an unindexed project store, it triggers project indexing before executing the query.
3. The tool accepts a query containing exactly one `MATCH` clause.
4. The tool accepts a query containing exactly one `RETURN` clause.
5. The tool accepts node patterns with aliases.
6. The tool accepts inline node property filters for `kind`.
7. The tool accepts inline node property filters for `name`.
8. The tool accepts a directed edge traversal pattern between two node aliases.
9. The tool accepts an optional edge alias in the traversal pattern.
10. The tool accepts an edge kind constraint in the traversal pattern.
11. The tool accepts a `WHERE` clause containing equality predicates.
12. The tool accepts multiple `WHERE` equality predicates joined by `AND`.
13. The tool accepts a `LIMIT` clause with a positive integer value.
14. The tool accepts `RETURN` alias projections for node aliases.
15. The tool accepts `RETURN` alias projections for edge aliases.
16. The tool accepts `RETURN` property projections for supported properties on returned aliases.
17. Query values are compiled to bound SQL parameters rather than interpolated directly into SQL text.
18. A valid node-only query returns anchored node results derived from the matched rows.
19. A valid traversal query returns anchored results for returned node aliases.
20. A valid traversal query returns structural edge results for returned edge aliases including edge kind.
21. A valid traversal query returns structural edge results for returned edge aliases including provenance fields.
22. When a returned node’s stored content hash does not match current file content, the rendered result includes a stale marker.
23. When a valid query matches zero rows, the tool returns a structured empty result rather than an empty string.
24. If the query contains malformed syntax, the tool returns a `parse_error` result.
25. If the query references an alias that is not declared in `MATCH`, the tool returns a `validation_error` result.
26. If the query uses an unsupported property in a filter, the tool returns a `validation_error` result.
27. If the query uses an unsupported property in a projection, the tool returns a `validation_error` result.
28. If the query uses `OR`, the tool returns an `unsupported_error` result.
29. If the query uses `OPTIONAL MATCH`, the tool returns an `unsupported_error` result.
30. If the query uses aggregation, the tool returns an `unsupported_error` result.
31. If the query uses ordering, the tool returns an `unsupported_error` result.
32. If the query uses mutation, the tool returns an `unsupported_error` result.
33. If the query uses variable-length paths, the tool returns an `unsupported_error` result.
34. If SQL execution fails after successful parsing and validation, the tool returns an `execution_error` result.
35. The implementation includes automated parser tests covering accepted syntax and rejected syntax.
36. The implementation includes automated compiler tests covering SQL shape and bound parameter ordering.
37. The implementation includes automated renderer tests covering anchored node output.
38. The implementation includes automated renderer tests covering edge output.
39. The implementation includes automated renderer tests covering stale markers.
40. The implementation includes automated renderer tests covering zero-result output.
41. The implementation includes end-to-end tests against an in-memory graph store covering node matching.
42. The implementation includes end-to-end tests against an in-memory graph store covering edge traversal.
43. The implementation includes end-to-end tests against an in-memory graph store covering `WHERE` filtering.
44. The implementation includes end-to-end tests against an in-memory graph store covering `RETURN` projections.
45. The implementation includes end-to-end tests against an in-memory graph store covering `LIMIT`.

## Out of Scope
- Full Cypher compatibility
- Multiple `MATCH` clauses
- `OPTIONAL MATCH`
- `OR` in `WHERE`
- Aggregations such as `COUNT`
- `ORDER BY`
- Mutating graph queries
- Variable-length path traversal
- Path variables
- General-purpose SQL execution
- Non-SQLite backends
- New graph storage schema changes beyond what is required to query the existing `nodes` and `edges` tables

## Open Questions
