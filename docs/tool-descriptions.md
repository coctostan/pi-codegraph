# Tool Description Style Guide

Tool descriptions exist to help the model decide whether to call a tool. Keep them short, action-oriented, and focused on the decision to reach for the tool.

## Rules
1. Start with one terse action-oriented line that says what the tool does or returns.
2. Add a `When to use:` block only when the trigger is not obvious from the first line.
3. Keep `When to use:` to 1-2 short lines.
4. Do not include inline examples in top-level tool descriptions.
5. Do not cross-reference other tool names from a description.
6. Do not restate parameters that the TypeBox schema already documents.

## Good
- `Return a symbol's callers, callees, tests, and key signals.`
  `When to use: You need structural context for a named symbol.`
- `Run a Cypher subset query against the graph.`
  `When to use: You need an ad hoc graph slice that is easier to express as a query.`

## Bad
- `Execute a Cypher subset query against the graph. Examples: MATCH ...`
- `Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`
- `Find symbols by approximate name. Parameters: query, kind, file, limit.`

## Maintenance
`src/index.ts` is the source of truth for registered tools. Keep the 5-tool default public surface, the 3 dev-mode-only tools behind `CODEGRAPH_DEVMODE=1`, and the internal-only `symbol_search` status consistent across this guide, `README.md`, and `ARCHITECTURE.md`.
Keep top-level descriptions terse. Parameter-level notes such as `symbol_graph.include` usage belong in README or schema docs, not in top-level tool descriptions.
