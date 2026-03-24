# Code Review: symbol_card tool

## Files Reviewed
- `src/tools/symbol-card.ts` (new, 105 lines) — core `symbolCard` function
- `src/index.ts` (+21 lines) — tool registration
- `test/tool-symbol-card-*.test.ts` (8 new test files) — comprehensive test coverage

## Strengths
- **Clean separation:** `symbol-card.ts:13` exports a pure function with injected dependencies — no global state, easy to test
- **Consistent patterns:** Disambiguation (lines 22-32) and not-found (line 19) match `symbol_graph` exactly
- **Compact format:** `formatRelGroup` (line 100) gives counts + top names without verbosity — exactly the right level for a glance card
- **Resource cleanup:** All test files properly clean up tmpdir and close store in try/finally

## Findings

### Critical
None.

### Important
1. **`__meta__`/`__unresolved__` neighbor filtering** — `symbol_graph` filters these internal markers from output (lines 125-131 in symbol-graph.ts). `symbol_card` was missing this, which would pollute relationship counts with resolver markers and unresolved import targets.
   - **Fixed:** Added filter on `allNeighbors` fetch (line 38-40 of symbol-card.ts). Added regression test `tool-symbol-card-meta-filter.test.ts`. 309 tests pass.

### Minor
1. **No LSP enrichment in tool registration** — `symbol_graph` spawns tsserver to resolve missing callers/implementations before rendering. `symbol_card` does not. This is acceptable: the card shows whatever edges exist, and LSP enrichment was described as optional in the brainstorm. Adding it later is straightforward if needed.
2. **Relationship section ordering** — callers → callees → imports → extends → implements is hardcoded. Could be extracted as a constant for consistency. Not worth changing now.

## Recommendations
None blocking. The implementation is minimal and correct.

## Assessment
**ready** — Clean implementation, all findings resolved. 309 tests pass, `tsc --noEmit` succeeds.
