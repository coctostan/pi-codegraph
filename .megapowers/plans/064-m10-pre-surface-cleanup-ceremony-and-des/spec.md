## Goal
Build the M10 pre-surface cleanup that removes default read-only output ceremony on fresh calls and standardizes tool descriptions and repo docs, so codegraph becomes lower-noise and easier for the model to pick correctly without changing tool names, schemas, or persisted graph behavior.

## Acceptance Criteria
1. When a read-only tool call resolves `TrustStatus` to `fresh`, the returned text omits the `## Trust` header entirely.
2. When a read-only tool call resolves `TrustStatus` to `stale`, `mixed`, `heuristic`, or `runtime-backed`, the returned text still includes the Trust header in the current format.
3. The `_meta: tokens_saved:...` footer is suppressed when `CODEGRAPH_DEVMETA` is unset or falsy.
4. The `_meta: tokens_saved:...` footer is emitted when `CODEGRAPH_DEVMETA` is truthy (for example `1`), and the environment variable is read on each tool call so changing it during a running session affects the next call without restart.
5. Per-edge provenance labels such as `[source: lsp]` remain rendered wherever they are rendered today and are not removed, hidden, or gated by AC 1-4.
6. Per-symbol signal badges such as `[hub]`, `[tested]`, and `[bottleneck]` remain rendered wherever they are rendered today and are not removed, hidden, or gated by AC 1-4.
7. The line `indexing-failed: graph may be stale (readonly database)` is still rendered whenever `lastIndexError` is set, regardless of Trust status and regardless of whether `_meta` is suppressed.
8. AC 1-7 apply uniformly to every tool currently registered through the read-only path in `src/index.ts`: `symbol_graph`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`, `graph_overview`, `dead_code`, and `symbol_search`; no per-tool override is introduced.
9. The repo contains `docs/tool-descriptions.md` that codifies this style guide for tool descriptions: a single terse action-oriented first line; an optional `When to use:` block of at most 2 lines only when needed; no inline examples; no cross-references to other tool names; and no top-level parameter restatement already covered by the TypeBox schema.
10. `README.md` and `ARCHITECTURE.md` list exactly the 11 tools registered in `src/index.ts` — `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`, `graph_overview`, `dead_code`, and `symbol_search` — and `ARCHITECTURE.md` contains a one-line pointer to `docs/tool-descriptions.md` instead of embedding the style guide inline.
11. The `description` strings in `src/index.ts` match the following approved current→proposed table for all 11 registered tools:

| Tool | Current | Proposed |
|---|---|---|
| `symbol_graph` | Look up a symbol and return its anchored neighborhood | Return a symbol's callers, callees, tests, and key signals.<br>When to use: You need structural context for a named symbol. |
| `resolve_edge` | Create an edge in the symbol graph with evidence | Create an evidence-backed edge in the symbol graph.<br>When to use: The graph is missing a relationship you can justify from code or docs. |
| `delete_edge` | Delete an agent-created edge from the symbol graph | Delete an agent-created edge from the symbol graph.<br>When to use: An agent-added relationship is incorrect or obsolete. |
| `impact` | Given changed symbols, return downstream dependents classified by change type | Return the classified blast radius for a set of changed symbols.<br>When to use: You are planning or reviewing a change to existing code. |
| `trace` | Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents. | Return the execution path starting from an entry point. Coverage-backed when available.<br>When to use: You need to understand what actually runs. |
| `graph_query` | Execute a Cypher subset query against the graph.<br>Examples:<br>MATCH (a {name: "hello"}) RETURN a<br>MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5<br>MATCH (n) WHERE n.name = "GraphStore" RETURN n.name<br>MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name<br>MATCH (n {kind: "function"}) RETURN n LIMIT 10 | Run a Cypher subset query against the graph.<br>When to use: You need an ad hoc graph slice that is easier to express as a query. |
| `symbol_card` | Return a compact symbol summary: definition, signature, tests, relationships, and signals | Return a compact symbol summary with definition, signature, tests, relationships, and signals. |
| `symbol_contract` | Extract behavioral contract for a symbol: what it takes, returns, throws, and what tests assert about it | Return a symbol's behavioral contract from code and tests.<br>When to use: You need inputs, outputs, throws, or asserted behavior. |
| `graph_overview` | Return a high-level overview of the indexed codebase: symbol distribution, hub symbols, most-imported files, and suggested queries | Return a high-level overview of the indexed codebase.<br>When to use: You need hotspots, distributions, and suggested starting points. |
| `dead_code` | Find unreferenced symbols. With name: check if a symbol has references. Without name: find all exported symbols with zero inbound edges. | Find unreferenced exported symbols or check whether a symbol is still referenced.<br>When to use: You are looking for cleanup candidates. |
| `symbol_search` | Search symbols by approximate name using BM25 ranked scoring. Tokenizes camelCase/snake_case queries and scores against symbol name, signature, and file path. | Find symbols by approximate name match.<br>When to use: You know roughly what a symbol is called but not its exact name or file. |

12. This issue does not change any tool `name` or `parameters` schema, does not add/remove/gate whole tools, and does not change tool output semantics other than the Trust-header and `_meta` gating in AC 1-8 plus the approved description/doc text updates in AC 9-11.
13. This issue introduces no changes to the indexer, graph store, SQLite schema, or `.codegraph/` layout.
14. The test suite is updated as needed to verify AC 1-8, including fresh-call suppression, non-fresh header rendering, `CODEGRAPH_DEVMETA` enablement, per-call env toggling, and readonly-database note independence, and all existing tests pass after any required snapshot or golden-output updates.

## Out of Scope
- Measuring and recording before/after token counts in the PR or other delivery artifact (`O1`).
- Adding comment lines above each `description:` field in `src/index.ts` (`O3`).
- Demoting `graph_query`, `graph_overview`, or `dead_code` behind `CODEGRAPH_DEVMODE` (`D1`).
- Making `symbol_search` internal-only (`D2`).
- Folding `symbol_contract` into `symbol_graph` or removing `symbol_card` / `symbol_contract` (`D3`).
- Evidence-driven deletion of `resolve_edge` or `delete_edge` (`D4`).
- Adding per-user config for dev-mode features beyond the single `CODEGRAPH_DEVMETA` env flag (`D5`).
- Adding deprecation warnings to tool output (`D6`).
- Any change to the indexer, graph store, SQLite schema, or `.codegraph/` layout (`D7`).
- Extending Trust-header or `_meta` ceremony to mutable tool paths that do not currently emit it; this issue only changes the existing read-only ceremony path plus description/doc text.

## Open Questions
None.

## Requirement Traceability
- `R1 -> AC 1, AC 2`
- `R2 -> AC 3, AC 4`
- `R3 -> AC 5`
- `R4 -> AC 6`
- `R5 -> AC 7`
- `R6 -> AC 8`
- `R7 -> AC 9`
- `R8 -> AC 11`
- `R9 -> AC 10`
- `R10 -> AC 10`
- `R11 -> AC 14`
- `R12 -> AC 4`
- `R13 -> AC 9, AC 10`
- `R14 -> AC 11`
- `O1 -> Out of Scope`
- `O3 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `D5 -> Out of Scope`
- `D6 -> Out of Scope`
- `D7 -> Out of Scope`
- `C1 -> AC 12`
- `C2 -> AC 10, AC 12`
- `C3 -> AC 3, AC 4`
- `C4 -> AC 12, AC 13`
- `C5 -> AC 5, AC 6`
- `C6 -> AC 10`