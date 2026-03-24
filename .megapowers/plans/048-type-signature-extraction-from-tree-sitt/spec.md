# Spec: Type Signature Extraction from Tree-sitter AST

## Goal

Add type signature extraction to the tree-sitter indexing pipeline and persist signatures on `GraphNode` / SQLite, so downstream tools (`symbol_card`, `symbol_contract`) can answer "what does this symbol take and return?" without reading source files.

## Acceptance Criteria

1. `GraphNode` in `src/graph/types.ts` has an optional `signature?: string` field.
2. SQLite `nodes` table has a nullable `signature TEXT` column, added via migration that handles existing databases lacking the column (same pattern as `is_exported`).
3. `SqliteGraphStore.addNode()` persists `signature`; `hydrateNode()` reads it back; all SELECT queries on `nodes` (`getNode`, `findNodes`, `getNodesByFile`, `getNeighbors`/`fetchNeighborRows`) include the `signature` column.
4. `extractFile()` produces a signature for `function_declaration` nodes: `(paramName: Type, ...) => ReturnType`. Type annotations are surface syntax as written in source.
5. `extractFile()` produces a signature for arrow functions (via `variable_declarator`): same format as AC 4.
6. `extractFile()` produces a signature for `class_declaration` nodes: `class Name extends Base implements Iface { constructor(param: Type) }`. Includes heritage clauses and constructor params only — no method signatures.
7. `extractFile()` produces a signature for `interface_declaration` nodes: `interface Name extends Base`. Includes extends clause only — no property or method signatures.
8. When a parameter or return type annotation is absent in source, the signature omits it rather than inferring (e.g. `(x)` not `(x: any)`, missing return type omitted entirely).
9. When a class has no constructor, the signature omits the constructor portion (just heritage clauses or just `class Name`).
10. When an interface has no extends clause, the signature is `interface Name` (or omitted/minimal — just the keyword + name).
11. Signatures round-trip correctly: extract → `addNode()` → SQLite → `getNode()` / `findNodes()` / `getNodesByFile()` returns the same `signature` string.
12. Nodes without signatures (e.g. `module` kind, or code without type info) have `signature` as `undefined` / `null` — not an empty string.
13. All existing tests (~270) pass without changes to their assertions.
14. New tests cover: typed function, untyped function, arrow function with types, generic function with type parameters, class with constructor + extends + implements, class without constructor, interface with extends, interface without extends.

## Out of Scope

- Doc comment / JSDoc extraction (D1 — separate issue)
- Invariant or contract inference from types (D2 — #050)
- Deep type resolution / following imports (D3)
- Method signatures inside class bodies (D4)
- Property/method signatures inside interfaces (D5)
- Including signatures in `formatNeighborhood` / `symbol_graph` output (O1 — can be added in #049)

## Open Questions

None.

## Requirement Traceability

- `R1` → AC 1
- `R2` → AC 2
- `R3` → AC 3
- `R4` → AC 4
- `R5` → AC 5
- `R6` → AC 6, AC 9
- `R7` → AC 7, AC 10
- `R8` → AC 4, AC 5, AC 6, AC 7 (surface syntax rule applies to all)
- `R9` → AC 8
- `R10` → AC 11
- `R11` → AC 13
- `R12` → AC 14
- `O1` → Out of Scope
- `O2` → AC 14 (generic function test case included; extraction of type params is implicitly needed for accurate signatures)
- `D1–D5` → Out of Scope
- `C1` → AC 2, AC 13 (no new deps, migration pattern)
- `C2` → AC 2
- `C3` → AC 4, AC 5 (addNode helper updated)
- `C4` → inherent in extractFile() design
