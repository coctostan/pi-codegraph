# Brainstorm: Type Signature Extraction from Tree-sitter AST

## Goal

Extend the tree-sitter extraction pipeline to capture type signatures for functions, arrow functions, classes, and interfaces, and persist them as a new `signature` field on `GraphNode` / SQLite `nodes` table. This is the prerequisite data layer for `symbol_card` (#049) and `symbol_contract` (#050).

## Mode

Direct requirements — the issue specifies the exact schema change, extraction targets, file list, and scope boundaries. No design ambiguity remains.

## Must-Have Requirements

- **R1:** Add optional `signature?: string` field to the `GraphNode` interface in `src/graph/types.ts`.
- **R2:** Add `signature TEXT` nullable column to the SQLite `nodes` table via schema migration in `src/graph/sqlite.ts`.
- **R3:** `addNode()` in SQLite store persists the `signature` value; `hydrateNode()` and all SELECT queries on `nodes` read it back.
- **R4:** For `function_declaration` nodes, extract parameter names with type annotations and return type annotation into a compact signature string (e.g. `(store: GraphStore, projectRoot: string) => string`).
- **R5:** For `arrow_function` nodes (detected via `variable_declarator`), extract the same parameter + return type signature as R4.
- **R6:** For `class_declaration` nodes, extract constructor parameter signature plus `extends`/`implements` clauses (e.g. `class SqliteGraphStore extends Base implements GraphStore { constructor(dbPath: string) }`). Do NOT include method signatures.
- **R7:** For `interface_declaration` nodes, extract `extends` clauses (e.g. `interface NeighborOptions extends BaseOptions`). Do NOT include property/method signatures.
- **R8:** Signatures use surface-level type syntax as written in source (e.g. `GraphStore`, `string`, `number | null`) — no deep type resolution or import path expansion.
- **R9:** When no type annotation is present on a parameter or return, omit the annotation rather than inferring (e.g. `(x) => void` not `(x: any) => void`).
- **R10:** Signatures survive full round-trip: extract → `addNode()` → SQLite → `getNode()` / `findNodes()` / `getNodesByFile()` → correct `signature` value.
- **R11:** All existing tests (~270) continue to pass with no changes to their assertions.
- **R12:** New tests verify signature extraction for representative cases: typed function, untyped function, arrow function, generic function, class with constructor + heritage, class without constructor, interface with extends, interface without extends.

## Optional / Nice-to-Have

- **O1:** Include signature in `formatNeighborhood` output (anchoring layer) so `symbol_graph` tool results show signatures.
- **O2:** Extract type parameters / generics (e.g. `<T extends Record<string, unknown>>`).

## Explicitly Deferred

- **D1:** Doc comment / JSDoc extraction — separate issue.
- **D2:** Invariant or contract inference from types — that's #050.
- **D3:** Deep type resolution (following imports to resolve `GraphStore` → `src/graph/store.ts::GraphStore`).
- **D4:** Method signatures inside class bodies.
- **D5:** Property signatures inside interfaces.

## Constraints

- **C1:** Bun runtime, TypeScript, tree-sitter parser — no new dependencies.
- **C2:** Schema migration must handle existing databases that lack the `signature` column (ALTER TABLE pattern already established for `is_exported`).
- **C3:** The `addNode` helper in `tree-sitter.ts` must be updated to accept an optional signature parameter without breaking the existing call pattern.
- **C4:** Incremental indexing: signature extraction happens during `extractFile()`, so re-indexing a file naturally refreshes its signatures.

## Open Questions

None.

## Recommended Direction

The implementation follows the established pattern for `is_exported`: add the field to `GraphNode`, add the column to SQLite with a migration check, and update `addNode` / `hydrateNode` / all SELECT queries. The tree-sitter extraction logic in `extractFile()` already visits the right AST node types — the work is reaching into their children for type annotations.

For functions and arrow functions, the tree-sitter AST exposes `parameters` (with `type_annotation` children on each `required_parameter` / `optional_parameter`) and a `return_type` field on the function node. The signature builder concatenates these into a compact `(param: Type, ...) => ReturnType` string, omitting annotations that don't exist.

For classes, the constructor is found by walking `class_body` for a `method_definition` named `constructor`, then extracting its parameter signature. Heritage clauses (`extends_clause`, `implements_clause`) are direct children of `class_declaration`.

For interfaces, `extends_type_clause` children give the extends list. No body extraction needed for v1.

## Testing Implications

- Unit tests for signature extraction: pass TypeScript source strings to `extractFile()`, assert the resulting `GraphNode.signature` values for each node kind.
- Round-trip tests: create nodes with signatures via `SqliteGraphStore.addNode()`, retrieve via `getNode()` / `findNodes()` / `getNodesByFile()`, assert `signature` field matches.
- Schema migration test: open a store, verify `signature` column exists, verify null default for nodes without signatures.
- Regression: run the full existing test suite to confirm no breakage.
