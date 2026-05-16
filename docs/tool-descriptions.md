# Tool Description Style Guide

Tool descriptions exist to help the model decide whether to call a tool. Keep them compact, action-oriented, and focused on capability.

## Rules
1. Start with one terse action-oriented line that says what the tool does or returns.
2. Do not add separate workflow guidance or `When to use:` blocks unless syntax would otherwise be ambiguous.
3. Do not duplicate enum values or action lists that already appear in the schema.
4. Do not include inline examples in top-level tool descriptions.
5. Do not cross-reference other tool names from a description.
6. Do not restate parameters that the TypeBox schema already documents.

## Good
- `Summarize a symbol with relationships, tests, and key metadata.`
- `Run a Cypher-subset query against the symbol graph.`
- `Classify blast radius for changed symbols.`
- `Return an execution path from an entry point, coverage-backed when available.`

## Bad
- `Execute a Cypher subset query against the graph. Examples: MATCH ...`
- `Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`
- `Find symbols by approximate name. Parameters: query, kind, file, limit.`

## Maintenance
`src/index.ts` is the source of truth for registered tools. Keep the default public surface and internal-only `symbol_search` status consistent across this guide, `README.md`, and `ARCHITECTURE.md`.
Keep top-level descriptions terse. Parameter-level notes such as `symbol_graph.include` usage belong in README or schema docs, not in top-level tool descriptions.
