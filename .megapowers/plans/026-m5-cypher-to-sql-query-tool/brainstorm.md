## Approach

Implement `graph_query` as a small, strict Cypher-subset tool layered on top of the existing SQLite-backed graph store. The tool should follow the same lifecycle as the existing tools: open or reuse the shared store, ensure the project is indexed, parse a constrained query language, compile it to parameterized SQLite, execute it, normalize result rows into a structured representation, and finally render anchored text output from those structured rows. The design should optimize for determinism, safety, and testability rather than broad Cypher compatibility.

For v1, the supported subset should be intentionally narrow: a single `MATCH` clause, node patterns with aliases and inline property filters, edge traversal with optional edge alias and edge kind, `WHERE` with equality predicates joined by `AND`, `RETURN` with both alias projections and property projections, and `LIMIT`. Unsupported features such as `OR`, `OPTIONAL MATCH`, aggregation, mutations, ordering, variable-length paths, and full path expressions should fail explicitly with structured errors. This keeps the implementation small enough for milestone M5 while still covering the use cases described in issue #016.

The key architectural choice is to treat the internal query model as schema-shaped rather than full-Cypher-shaped. The parser should emit a compact AST tailored to the `nodes` and `edges` tables, and the compiler should produce deterministic SQL joins and bound parameters. Structured rows should be the canonical execution result, with anchored text as the final rendering layer. That preserves consistency with the rest of the project while giving the implementation a strong internal seam for testing and future extension.

## Key Decisions

- Use a strict Cypher subset instead of attempting full Cypher compatibility.
- Keep v1 to one `MATCH` clause, one pattern chain, `WHERE`, `RETURN`, and `LIMIT`.
- Support node filters by `kind` and `name` via inline property maps and `WHERE` equality predicates.
- Support edge traversal by edge kind with optional edge alias.
- Support `WHERE` boolean composition with `AND` only; reject `OR` as unsupported.
- Support `RETURN` of both aliases (`a`, `r`, `b`) and property projections (`a.name`, `b.file`).
- Compile to parameterized SQLite SQL only; never interpolate raw values into SQL.
- Treat parse, validation, unsupported-feature, and execution failures as distinct error classes.
- Return structured rows internally first, then render anchored text for tool output.
- For zero matches, return a structured empty result shape rather than an empty string.
- Reuse existing anchoring behavior via `computeAnchor`, including stale markers.
- Do not add speculative features such as aggregation, mutation, ordering, or general graph execution in v1.

## Components

- `graph_query` tool entry in `src/index.ts`
  - Registers the tool with pi.
  - Ensures indexing before query execution.
  - Invokes parser → compiler → executor → renderer pipeline.

- Query AST module
  - Defines the internal representation for supported Cypher-subset queries.
  - Captures node aliases, edge aliases, traversal direction, filters, return projections, and limit.

- Parser module
  - Parses the supported Cypher subset into the AST.
  - Performs syntax-level checks and emits precise parse errors.

- Validator module (may be separate or folded into parser/compiler)
  - Verifies alias references, allowed properties, supported clause shapes, and unsupported constructs.
  - Emits semantic/validation errors distinct from parse errors.

- SQL compiler module
  - Converts the AST into parameterized SQL against `nodes` and `edges`.
  - Maps aliases to deterministic SQL table aliases.
  - Produces SQL text plus bound parameter list.

- Execution/normalization module
  - Runs compiled SQL against SQLite.
  - Converts raw DB rows into structured result rows and typed columns.

- Result renderer
  - Renders structured rows into anchored text.
  - Uses `computeAnchor` for node projections.
  - Renders edge projections with kind/source/target/provenance details.
  - Preserves stale markers instead of failing on stale data.

## Testing Strategy

Use layered tests with a small number of end-to-end tool tests.

- Parser unit tests
  - Accept simple node match queries.
  - Accept node-edge-node traversals.
  - Accept inline property filters.
  - Accept `WHERE` equality predicates joined by `AND`.
  - Accept `RETURN` alias projections and property projections.
  - Accept `LIMIT`.
  - Reject malformed syntax, duplicate aliases, unknown aliases, and unsupported clauses such as `OR` and `OPTIONAL MATCH`.

- Compiler unit tests
  - Given known AST fixtures, assert generated SQL structure and bound parameter order.
  - Verify correct joins between `nodes` and `edges`.
  - Verify `WHERE` and `LIMIT` compilation.
  - Verify alias/property projections map to the expected selected columns.

- Renderer unit tests
  - Verify node columns render as anchored values.
  - Verify edge columns render with structural details and provenance.
  - Verify stale markers are surfaced.
  - Verify zero-result rendering uses the agreed structured empty shape.

- Integration tests against in-memory `SqliteGraphStore`
  - Seed a tiny graph and run real `graph_query` calls end-to-end.
  - Cover filtering by node kind/name, traversal by edge kind, `WHERE`, `RETURN`, and `LIMIT`.
  - Verify output is deterministic, anchored, and compatible with the project’s structured-output expectations.

This strategy keeps most failures local and easy to diagnose while still proving the full tool works over the real store abstraction.