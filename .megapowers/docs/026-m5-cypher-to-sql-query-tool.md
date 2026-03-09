# Feature: `graph_query` Tool — Cypher-to-SQL Subset Translator

**Issue:** 026-m5-cypher-to-sql-query-tool  
**Milestone:** M5

## Summary

Adds a `graph_query` tool to the pi-codegraph extension. The tool accepts a strict, testable subset of Cypher, translates it to parameterized SQLite queries over the existing graph store, and returns hashline-anchored results in the project's standard text format.

## Motivation

Agents need a flexible read-only query tool for graph exploration. `symbol_graph` is great for neighborhood lookups but cannot express arbitrary traversal predicates. `graph_query` fills that gap without requiring full Cypher or introducing unsafe, ambiguous, or hard-to-test behavior.

## What Was Built

### New Files

| File | Purpose |
|------|---------|
| `src/tools/graph-query-parser.ts` | Parses the Cypher subset into a typed AST. Handles unsupported feature rejection, validation, and parse errors. |
| `src/tools/graph-query-compiler.ts` | Compiles an AST into a parameterized SQL SELECT query over the `nodes`/`edges` tables. Values are always bound parameters — never interpolated. |
| `src/tools/graph-query-render.ts` | Renders SQL result rows as hashline-anchored text. Supports node aliases (with stale detection), edge aliases (with provenance fields), scalar property projections, and zero-result output. |
| `src/tools/graph-query.ts` | Orchestrates parse → compile → execute → render. Returns structured error strings for parse, validation, unsupported, and execution errors. |

### Modified Files

| File | Change |
|------|--------|
| `src/graph/store.ts` | Added `queryRows<T>` to `GraphStore` interface |
| `src/graph/sqlite.ts` | Implemented `queryRows<T>` with a SELECT-only runtime guard |
| `src/index.ts` | Registered `graph_query` tool with `GraphQueryParams` schema and `ensureIndexed` auto-indexing |

## Supported Cypher Subset

```cypher
MATCH (alias {kind: "...", name: "..."})
MATCH (left)-[edge:kind]->(right)
MATCH (left)<-[edge:kind]-(right)
WHERE alias.property = "value" AND ...
RETURN alias, alias.property, ...
LIMIT n
```

### Accepted
- Single `MATCH` clause
- Node patterns with aliases and inline `kind`/`name` filters
- Directed edge traversal (outgoing and incoming)
- Optional edge alias
- Edge kind constraint
- `WHERE` equality predicates joined by `AND`
- `RETURN` alias and property projections
- `LIMIT` with positive integer

### Rejected with structured errors
- Multiple `MATCH` → `parse_error`
- Missing/duplicate `RETURN` → `parse_error`
- Non-positive `LIMIT` → `parse_error`
- Unbound alias in `RETURN` or `WHERE` → `validation_error`
- Unsupported filter/projection property → `validation_error`
- `OR` in `WHERE` → `unsupported_error`
- `OPTIONAL MATCH` → `unsupported_error`
- Aggregation (`COUNT`) → `unsupported_error`
- `ORDER BY` → `unsupported_error`
- Mutating clauses (`CREATE`, `MERGE`, `DELETE`, `SET`) → `unsupported_error`
- Variable-length paths (`[*]`) → `unsupported_error`
- SQL execution failure → `execution_error`

## Output Format

Node aliases are rendered as hashline anchors:
```
rows: 2
row 1
  a: src/foo.ts:10:ab12  myFunction  function
row 2
  a: src/bar.ts:5:cd34  anotherFn  function [stale]
```

Edge aliases include provenance:
```
  r: calls  source:src/a.ts::foo:1  target:src/b.ts::bar:1  provenance:lsp  confidence:0.9  evidence:ref
```

Scalar projections:
```
  b.file: src/b.ts
```

Empty result:
```
rows: 0
```

## Security

All user-supplied values go through bound SQL parameters — no string interpolation occurs in the generated SQL. The `queryRows` method additionally enforces a SELECT-only guard at the store level as defense-in-depth. Mutation keyword detection strips string literals before checking to avoid false positives on node names like `"create"` or `"delete"`.

## Test Coverage

164 tests, 0 failures across 67 files. The `graph_query` feature adds 27 new test files:
- 1 compiler test (SQL shape + param ordering)
- 1 full parser happy-path test
- 14 parser rejection tests (per clause/error type)
- 4 renderer unit tests (node, edge, stale, empty)
- 4 end-to-end tests (node match, traversal, WHERE, RETURN projections, LIMIT)
- 1 extension registration test
- 1 execution error test
- 1 `queryRows` store test
