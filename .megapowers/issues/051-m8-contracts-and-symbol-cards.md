---
id: 51
type: feature
status: done
created: 2026-03-24T02:56:20.317Z
sources: [48, 49, 50]
---
# M8: Contracts and symbol cards
Turn codegraph from a dependency browser into a verification input. Extract type signatures, expose compact symbol cards, and mine behavioral contracts from types and test assertions.

Build order:
1. #048 — Type signature extraction (data layer prerequisite)
2. #049 — symbol_card tool (assembly of existing data + signatures)
3. #050 — symbol_contract tool (new extraction: error paths, test assertion mining)

Exit criteria:
- A symbol can answer: what it takes in, what it returns, what tests cover it, what invariants hold, what nearby symbols matter most
- Agents get verification-grade intelligence in one call, not navigation hints requiring grep chains
