# Feature: `symbol_contract` tool

## Summary

Added a `symbol_contract` tool that extracts behavioral evidence about a symbol — what it takes, returns, throws, and what tests assert about it — in a single call. This turns codegraph from a structural navigation tool into a verification input.

## What was built

### Contract extraction pipeline (`src/indexer/contract-extractor.ts`)

Three on-demand extraction functions that parse TypeScript source using tree-sitter at tool-call time:

- **`extractThrows()`** — Finds `throw` statements in a function body. Extracts error messages from `throw new Error("msg")`, class names from `throw new CustomError(...)`, and expression text from plain `throw expr`.
- **`extractGuards()`** — Finds early-return guard patterns like `if (!x) return` that indicate preconditions.
- **`extractTestAssertions()`** — Parses test files to extract `expect()` assertions grouped by enclosing `test()`/`it()` block name. Supports `toBe`, `toThrow`, `toContain`, `toHaveLength`.

### Tool function (`src/tools/symbol-contract.ts`)

The `symbolContract()` function assembles a structured contract from multiple data sources:

1. **Takes / Returns** — Parsed from the node's `signature` field (populated by #048)
2. **Throws / Error paths** — Extracted from function body via tree-sitter
3. **Guards / Preconditions** — Extracted from function body via tree-sitter
4. **Test-evidenced behaviors** — Mined from test files linked via `tested_by` graph edges

Each section degrades independently — missing source files don't block signature display, missing tests don't block throw extraction, etc.

### Tool registration (`src/index.ts`)

Registered as `symbol_contract` with params `{ name: string, file?: string }`. Same disambiguation, trust header, and anchor patterns as `symbol_card` and `symbol_graph`.

## Example output

```
## Trust
status: fresh
evidence: coverage  stale-files: 0/3
## Contract: validate
src/validate.ts:1:a3f2

### Takes
  input: string

### Returns
  boolean

### Throws / Error paths
  - empty input
  - ValidationError

### Guards / Preconditions
  - !input

### Test-evidenced behaviors (from 2 tests)
  ✓ returns true for valid input
    toBe(true)
  ✓ throws on empty
    toThrow("empty input")
```

## Files

| File | Status | Purpose |
|------|--------|---------|
| `src/indexer/contract-extractor.ts` | new | Throw, guard, and test assertion extraction |
| `src/tools/symbol-contract.ts` | new | Tool function assembling the contract |
| `src/index.ts` | modified | Tool registration |
| 12 test files | new | 25 tests covering all acceptance criteria |

## Testing

334 tests pass (25 new), 1063 expect() calls across 147 files. Zero regressions.

## Code review note

During code review, a bug was found and fixed: `parseSignatureParams` used naive `indexOf(">")` to strip type parameters, which broke for nested generics like `<T extends Map<string, number>>`. Fixed with depth-tracking bracket matching and regression test added.
