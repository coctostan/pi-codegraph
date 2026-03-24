---
id: 50
type: feature
status: open
created: 2026-03-24T02:56:12.544Z
sources: [48, 49]
priority: 2
---
# symbol_contract tool: extract behavioral evidence from types and tests
## Goal

Add a `symbol_contract` tool that extracts and surfaces behavioral evidence about a symbol — what it takes, what it returns, what it throws, and what tests assert about it. This turns codegraph from a structural navigation tool into a verification input.

## Motivation

When an agent plans a change, reviews code, or writes tests, it needs to know: "What does this symbol promise?" Currently the graph answers "who calls/uses this?" but not "what behavior does it guarantee?" The contract tool bridges that gap by mining existing evidence (types, test assertions, error handling) without requiring embeddings or LLMs.

## Scope

### Contract extraction pipeline (new indexer stage or on-demand)
Using tree-sitter and/or ast-grep to extract from the symbol's own body:
- **Input types**: parameter types from signature (via #048)
- **Return type**: from signature
- **Thrown errors**: `throw new Error(...)` / `throw` statements within the function body
- **Early returns / guards**: `if (!x) return` patterns that indicate preconditions

### Test assertion mining
Using ast-grep patterns against test files that cover this symbol (via `tested_by` edges):
- `expect(result).toBe(value)` → "returns `value`"
- `expect(result).toHaveLength(n)` → "returns collection of length n"  
- `expect(() => fn()).toThrow(msg)` → "throws when..."
- `expect(result).toContain(x)` → "result contains x"
- Group by test name for context

### Output format
```
## Contract: deleteEdge
src/tools/delete-edge.ts:39:abc1

### Takes
  params: DeleteEdgeParams  {source: string, target: string, kind: string, ...}

### Returns
  string

### Throws / Error paths
  - "Source symbol not found" (when source lookup fails)
  - "Invalid edge kind" (when kind not in valid set)
  - "No agent edge found" (when no matching edge exists)

### Test-evidenced behaviors (from 8 tests)
  ✓ deletes an existing agent edge and returns confirmation
  ✓ returns error when source symbol not found
  ✓ rejects invalid edge kinds
  ✓ reports not-found when only a non-agent edge exists
```

### Tool registration
- New file: `src/tools/symbol-contract.ts`
- New file (optional): `src/indexer/contract-extractor.ts`  
- Register in `src/index.ts` with params: `{ name: string, file?: string }`

### What to defer
- Invariant inference beyond what's directly in the AST/tests
- Cross-function contract composition
- Doc comment parsing (useful but separate concern)

## Dependencies
- #048 (type signatures) — for input/return types
- #049 (symbol_card) — not a hard dependency, but card should be able to link to contract

## Files involved
- `src/tools/symbol-contract.ts` (new)
- `src/indexer/contract-extractor.ts` (new, optional)
- `src/index.ts` — register tool
- May add new ast-grep rules under `src/rules/`

## Exit criteria
- `symbol_contract({ name: "deleteEdge" })` returns input types, return type, error paths, and test-evidenced behaviors
- Test assertion mining works for `expect().toBe/toThrow/toContain/toHaveLength` patterns
- Error paths are extracted from `throw` statements in function body
- Output is anchored and includes trust header
- Falls back gracefully when no tests or no signature exist
