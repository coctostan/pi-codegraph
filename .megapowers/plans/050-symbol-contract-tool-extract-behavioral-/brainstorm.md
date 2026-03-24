# Brainstorm: symbol_contract tool

## Goal

Add a `symbol_contract` tool that extracts and surfaces behavioral evidence about a symbol — what it takes, returns, throws, and what tests assert about it. This turns codegraph from a structural navigation tool into verification input, answering "what does this symbol promise?" in one call.

## Mode

Direct requirements — the issue scope, output format, dependencies, and exit criteria are already concrete. Both prerequisite issues (#048 type signatures, #049 symbol_card) are complete.

## Must-Have Requirements

- **R1:** New `symbol_contract` tool registered in `src/index.ts` with params `{ name: string, file?: string }`
- **R2:** Extract input parameter types from the node's `signature` field (populated by #048)
- **R3:** Extract return type from the node's `signature` field
- **R4:** Extract thrown errors by parsing `throw new Error(...)` and `throw` statements within the function body using tree-sitter
- **R5:** Extract early return / guard patterns (`if (!x) return`) that indicate preconditions
- **R6:** Mine test assertions from test files linked via `tested_by` edges — support at minimum: `expect().toBe()`, `expect().toThrow()`, `expect().toContain()`, `expect().toHaveLength()`
- **R7:** Group test-evidenced behaviors by test name for context
- **R8:** Output includes trust header (same pattern as other tools)
- **R9:** Output includes hashline-anchored definition location
- **R10:** Ambiguous symbol handling uses the same disambiguation pattern as `symbol_graph` and `symbol_card`
- **R11:** Graceful fallback when no tests exist (show what's available without test evidence)
- **R12:** Graceful fallback when no signature exists (show error paths and test evidence without type info)
- **R13:** Not-found symbols return a clear message with trust header

## Optional / Nice-to-Have

- **O1:** Expand assertion pattern coverage beyond the four core matchers (e.g., `toEqual`, `toBeTruthy`, `toBeNull`, `toMatchObject`)
- **O2:** Extract conditional return types or union return analysis from function body

## Explicitly Deferred

- **D1:** Invariant inference beyond what's directly in the AST/tests
- **D2:** Cross-function contract composition (e.g., composing contracts of callees)
- **D3:** Doc comment / JSDoc parsing
- **D4:** Deep type resolution (resolving imported type definitions — surface syntax only)

## Constraints

- **C1:** TypeScript only (consistent with project scope)
- **C2:** No embeddings, no LLMs, no external servers — pure AST/graph extraction
- **C3:** Must use tree-sitter for function body analysis (throw/guard extraction), consistent with existing pipeline
- **C4:** Must not break existing tests (~130+ test files)
- **C5:** Bun runtime, same test framework as existing tests

## Open Questions

None.

## Recommended Direction

Create `src/tools/symbol-contract.ts` as the main tool, with an optional `src/indexer/contract-extractor.ts` for the body-analysis logic (throw extraction, guard detection). The tool should be on-demand (not a new indexing stage) — it reads the symbol's source file and parses it with tree-sitter at call time, since contract extraction needs the function body text which isn't stored in the graph.

For test assertion mining, use ast-grep patterns or tree-sitter walks against the test files identified by `tested_by` edges. The test file content needs to be read and parsed at tool-call time. Group assertions by their enclosing test name (the string argument to `it()` or `test()`).

The output format should follow the structure from the issue: sections for Takes, Returns, Throws/Error paths, and Test-evidenced behaviors. Keep it flat and scannable like `symbol_card`, not nested. Reuse `computeAnchor`, `prependTrustHeader`, and the disambiguation pattern from existing tools.

## Testing Implications

- Happy path: function with signature, throws, guards, and covering tests → full contract output
- No tests: function with signature and throws but no `tested_by` edges → partial output
- No signature: function without type annotations → shows error paths and test evidence only
- Not found: returns error message with trust header
- Ambiguous: multiple matches → disambiguation list
- Assertion patterns: individual tests for each supported matcher type (`toBe`, `toThrow`, `toContain`, `toHaveLength`)
- Guard extraction: function with `if (!x) return` patterns → preconditions listed
- Throw extraction: function with `throw new Error("msg")` → error paths listed
