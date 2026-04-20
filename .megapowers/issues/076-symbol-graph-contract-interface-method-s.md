---
id: 76
type: bugfix
status: open
created: 2026-04-20T10:32:55.992Z
priority: 2
---
# symbol_graph contract: interface method signatures missing — shows only "interface Foo"
## Problem

When `include: ["contract"]` is used on an interface symbol, the Contract section is nearly empty:

```
## Contract: GraphStore
src/graph/store.ts:30:c121

### Takes
  interface GraphStore
```

The interface has 15 method signatures (`addNode`, `getNeighbors`, `getNode`, etc.) none of which appear. The same happens for `GraphStatistics`. The contract extractor only handles function-style signatures, not interface body members.

## Root cause

`renderSymbolContractBody` (src/tools/symbol-contract.ts:68) calls `parseSignatureParams` (line 15) which parses function parameter lists. For interface nodes, the stored `signature` field is just `"interface GraphStore"` and there's no method-body parsing.

`extractGuards` and `extractThrows` in src/indexer/contract-extractor.ts also only process function bodies.

## Expected output

```
## Contract: GraphStore
src/graph/store.ts:30:c121

### Methods
  addNode(node: GraphNode): void
  getNode(id: string): GraphNode | null
  findNodes(name: string, file?: string): GraphNode[]
  getNeighbors(id: string, options: NeighborOptions): NeighborResult[]
  ... (remaining methods)
```

## Implementation guidance

In `src/indexer/tree-sitter.ts`, `extractInterfaceSignature` (line 164) already has access to the full interface AST node. It should extract each method signature and store them either:
- In the `signature` field as a multi-line string, or
- In a separate `members` column on the `nodes` table

Then `renderSymbolContractBody` / `parseSignatureParams` should detect the `kind === "interface"` case and render the member list instead of treating it as a function signature.

## Acceptance criteria

- `symbol_graph("GraphStore", { include: ["contract"] })` shows all method signatures from the interface body
- `symbol_graph("GraphStatistics", { include: ["contract"] })` shows all field types
- Function symbols with `include: ["contract"]` continue working as before
- The `signature` field in the DB is not broken for non-interface nodes
