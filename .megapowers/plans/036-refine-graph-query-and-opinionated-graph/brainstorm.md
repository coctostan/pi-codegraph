# Brainstorm: Refine graph_query and opinionated graph inspection UX

## Goal

`graph_query` is functional but has poor agent ergonomics: unsupported queries produce unhelpful errors, the supported Cypher subset is undiscoverable, and the one query pattern agents can't get from other tools — substring symbol search — isn't supported. This issue makes `graph_query` fail less, guide more, and cover the gap between what agents try and what works.

## Mode

`Direct requirements` — agent-perspective analysis produced a clear, prioritized list of concrete improvements with no design ambiguity remaining.

## Must-Have Requirements

- **R1:** Error messages for unsupported/invalid queries must include a suggestion showing how to write a supported query that accomplishes the same intent (or the closest supported alternative).
- **R2:** The parser must support `CONTAINS` string predicates in WHERE clauses (e.g., `WHERE n.name CONTAINS 'Handler'`).
- **R3:** The parser must support `STARTS WITH` string predicates in WHERE clauses (e.g., `WHERE n.name STARTS WITH 'get'`).
- **R4:** The tool description registered in the pi extension must include 3–5 working example queries that cover the supported pattern space (single node, traversal, WHERE equality, WHERE CONTAINS, LIMIT).
- **R5:** WHERE predicates must work correctly on edge aliases, not just node aliases (fix the existing compiler bug where `nodeAliases[predicate.alias]` is used but `edgeAliases` is not consulted).

## Optional / Nice-to-Have

- **O1:** Support `COUNT(*)` or `COUNT(n)` as a return projection for basic graph orientation queries.
- **O2:** Support `DISTINCT` in return projections to deduplicate results.

## Explicitly Deferred

- **D1:** Canned query presets / named shortcuts — adds a second API surface to learn; better tool descriptions are higher ROI.
- **D2:** `ORDER BY` support — low agent value relative to implementation cost.
- **D3:** Multi-hop path patterns (e.g., `(a)-[]->(b)-[]->(c)`) — `trace` covers this use case.
- **D4:** `OR` in WHERE clauses — agents can issue two queries.
- **D5:** `OPTIONAL MATCH` — not needed for the supported query patterns.

## Constraints

- **C1:** Must not break any existing supported query syntax or test.
- **C2:** All changes stay within the existing parser→compiler→renderer pipeline architecture.
- **C3:** Error suggestion messages must be static/deterministic (no LLM generation inside the tool).

## Open Questions

None.

## Recommended Direction

The highest-ROI change is improving error messages (R1). Today, a failed query costs the agent a full tool-call round-trip with zero useful information. If every error includes a "try instead: ..." suggestion showing the closest supported pattern, agents self-correct in one shot instead of flailing. This means enriching `GraphQueryError` with an optional `suggestion` field and populating it in `rejectUnsupported()` and the parse/validation error paths.

Next, `CONTAINS` and `STARTS WITH` (R2, R3) close the biggest functional gap — substring search is the one thing agents genuinely can't do through `symbol_graph` or the other opinionated tools. This requires extending `WhereClause` to carry an operator field (`=`, `CONTAINS`, `STARTS WITH`), updating the parser regex, and emitting `LIKE` or `INSTR()` in the SQL compiler.

The edge-alias WHERE bug (R5) is a straightforward compiler fix — `compileGraphQuery` needs to check `edgeAliases` as a fallback when `nodeAliases` doesn't contain the predicate alias.

Finally, the tool description examples (R4) are the cheapest change with outsized impact. Agents read tool descriptions before every call; 3–5 working examples eliminate most guesswork about what's supported.

## Testing Implications

- Each new WHERE operator (`CONTAINS`, `STARTS WITH`) needs parser tests (valid syntax, edge cases like empty string) and compiler tests (correct SQL generation with `LIKE`/`INSTR`).
- Error suggestion tests: for each unsupported feature (`ORDER BY`, `COUNT`, `OR`, mutations, variable-length paths), verify the error message includes a non-empty suggestion string.
- Edge-alias WHERE: test a query like `MATCH (n)-[e:calls]->(m) WHERE e.confidence = '0.9' RETURN n, m` compiles and executes correctly.
- Regression: all existing graph-query tests must continue to pass unchanged.
- Tool description: verify the registered tool description contains example queries (extension wiring test).
