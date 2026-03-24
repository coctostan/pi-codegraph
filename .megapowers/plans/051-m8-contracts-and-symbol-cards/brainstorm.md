## Goal

M8 (Contracts and Symbol Cards) batch delivery. All three source issues (#048, #049, #050) are already implemented, tested, and passing. This batch issue exists to verify the integrated milestone is coherent and close it out.

## Mode
Direct requirements — all work is complete. The three source issues shipped independently and all 334 tests pass. This is a verification/wrap-up pass.

## Must-Have Requirements
- R1: All 334 existing tests pass with zero failures
- R2: `symbol_card` tool is registered in the pi extension and callable with `{ name, file? }` params
- R3: `symbol_contract` tool is registered in the pi extension and callable with `{ name, file? }` params
- R4: Type signatures are extracted and persisted for functions, arrow functions, classes, and interfaces
- R5: No regressions in any existing tools (`symbol_graph`, `trace`, `impact`, `graph_query`, `resolve_edge`, `delete_edge`)

## Optional / Nice-to-Have
- O1: Verify cross-tool consistency (e.g. `symbol_card` signature matches what `symbol_contract` reports)

## Explicitly Deferred
- D1: Doc comment extraction (mentioned as future work in source issues)
- D2: Cross-function contract composition
- D3: Invariant inference beyond direct AST/test evidence

## Constraints
- C1: All source issues (#048, #049, #050) are already implemented and tested
- C2: This is a batch close-out — no new feature work expected

## Open Questions
None.

## Recommended Direction
This is a batch wrap-up. All three constituent issues are implemented: type signature extraction in the tree-sitter pipeline (#048), `symbol_card` tool (#049), and `symbol_contract` tool with contract-extractor (#050). The codebase has 334 passing tests across 147 files.

The recommended path is to verify the integrated state is clean (tests pass, tools are wired, no stale artifacts) and close out the milestone. No new code is needed.

## Testing Implications
- All 334 existing tests already cover the M8 scope
- Signature extraction: 8+ dedicated tests (function, arrow, class, interface, generics, module, round-trip, schema)
- symbol_card: 8+ tests (happy, ambiguous, not-found, no-tests, no-signature, wiring, extends/implements, meta-filter)
- symbol_contract: 8+ tests (happy, ambiguous, not-found, no-tests, no-signature, no-body, generic-sig, wiring)
- Contract extractor: 3 dedicated tests (assertions, guards, throws)
