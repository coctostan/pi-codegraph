# Spec: symbol_card tool — compact symbol summary

## Goal
Add a `symbol_card` tool that returns a compact, structured fact sheet for a symbol — definition, signature, tests, relationships, and signals — in one call, so agents can decide what to read or change without combining multiple tool outputs.

## Acceptance Criteria

1. A `symbol_card` tool is registered in `src/index.ts` with TypeBox params `{ name: string, file?: string }` following the same registration pattern as `symbol_graph` (TypeBox params, `getOrCreateStore`, `ensureIndexed`).
2. When exactly one node matches, the card includes: symbol name, kind, hashline-anchored definition location, type signature, export status, covering tests, key relationships, and signal badges.
3. When multiple nodes match `name`, the tool returns a disambiguation list with each candidate's name, kind, file, and hashline anchor — same pattern as `symbol_graph`.
4. When no nodes match, the tool returns a "not found" message.
5. All outputs are prepended with a trust header via `prependTrustHeader`.
6. All symbol and test anchors use `computeAnchor` and reflect current file content (stale detection works).
7. The Signature section displays `node.signature` when present; displays "not available" when `node.signature` is null/undefined.
8. Covering tests are sourced from `tested_by` edges (direction: out) and listed with hashline anchors and test names.
9. Key Relationships shows callers, callees, and imports — each as a count plus the top few names (no per-neighbor confidence/provenance detail).
10. Signal badges are rendered via `formatRoleTags` from the existing signal computer.
11. The card format is flat markdown — header with name/kind/anchor, then sections (Signature, Exported, Covering Tests, Key Relationships, Signals) — distinct from and more compact than `symbol_graph` output.
12. `extends`/`implements` relationships are included in Key Relationships when present.
13. The implementation lives in `src/tools/symbol-card.ts` with a pure `symbolCard` function (store + projectRoot injected, no global state).
14. All existing tests continue to pass.

## Out of Scope
- Invariant/contract inference (deferred to `symbol_contract` #050)
- Doc comment extraction
- Deep type resolution beyond surface syntax
- Configurable section inclusion / filtering
- Duplicating `symbol_graph` rendering logic (`formatNeighborhood` is not reused)

## Open Questions
None.

## Requirement Traceability
- `R1 -> AC 1`
- `R2 -> AC 2, AC 11`
- `R3 -> AC 3, AC 4`
- `R4 -> AC 6`
- `R5 -> AC 5`
- `R6 -> AC 7`
- `R7 -> AC 8`
- `R8 -> AC 9`
- `R9 -> AC 10`
- `R10 -> AC 9, AC 11`
- `O1 -> AC 12` (promoted — trivial since edges already exist)
- `O2 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `C1 -> AC 11, Out of Scope ("Duplicating symbol_graph rendering")`
- `C2 -> AC 7`
- `C3 -> AC 14`
- `C4 -> AC 1`
- `C5 -> AC 13`
