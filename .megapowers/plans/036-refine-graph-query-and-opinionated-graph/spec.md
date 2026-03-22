## Goal

Improve `graph_query` so it is more usable by coding agents: unsupported queries should guide recovery, substring name search should be supported, the supported subset should be discoverable from the tool description, and existing single-hop query behavior must remain correct.

## Acceptance Criteria

1. When `graph_query` rejects an unsupported query form, the returned error text includes a deterministic suggestion that shows a supported query or closest supported alternative.
2. When `graph_query` rejects an invalid query syntax or invalid bound-property usage, the returned error text includes a deterministic suggestion that helps the caller rewrite the query into a supported form.
3. `parseGraphQuery()` accepts `WHERE <alias>.<property> CONTAINS <string-literal>` for supported aliases and produces a parsed predicate that preserves the `CONTAINS` operator.
4. `parseGraphQuery()` accepts `WHERE <alias>.<property> STARTS WITH <string-literal>` for supported aliases and produces a parsed predicate that preserves the `STARTS WITH` operator.
5. `compileGraphQuery()` compiles `CONTAINS` predicates into parameterized SQL that performs substring matching without string interpolation.
6. `compileGraphQuery()` compiles `STARTS WITH` predicates into parameterized SQL that performs prefix matching without string interpolation.
7. A query with a WHERE predicate on an edge alias compiles using the edge table alias rather than incorrectly assuming a node alias.
8. A query with a WHERE predicate on an edge alias executes successfully when the referenced edge property is one of the currently allowed edge return/filter properties supported by the implementation.
9. The `graph_query` tool description registered in `src/index.ts` includes 3–5 concrete working example queries covering: single-node match, single-hop traversal, equality WHERE, `CONTAINS` WHERE, and `LIMIT`.
10. Existing supported query forms covered by current graph-query tests continue to pass unchanged.

## Out of Scope

- `COUNT(*)` or `COUNT(alias)` support.
- `DISTINCT` support.
- Canned query presets or named shortcuts.
- `ORDER BY` support.
- Multi-hop path query support.
- `OR` support in WHERE clauses.
- `OPTIONAL MATCH` support.
- Any architectural rewrite outside the current parser → compiler → renderer flow.
- Any non-deterministic or LLM-generated error recovery text.

## Open Questions

None.

## Requirement Traceability

- `R1 -> AC 1, AC 2`
- `R2 -> AC 3, AC 5`
- `R3 -> AC 4, AC 6`
- `R4 -> AC 9`
- `R5 -> AC 7, AC 8`
- `O1 -> Out of Scope`
- `O2 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `D5 -> Out of Scope`
- `C1 -> AC 10`
- `C2 -> Out of Scope`
- `C3 -> AC 1, AC 2`
