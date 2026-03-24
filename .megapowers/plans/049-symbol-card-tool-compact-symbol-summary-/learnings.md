# Learnings from #049: symbol_card tool

- **Filter internal markers:** `symbol_graph` filters `__meta__` and `__unresolved__` neighbors — any new tool that reads neighbors must do the same. This was caught in code review, not during initial implementation. Add to a checklist for future neighbor-consuming tools.
- **Verification tests are valuable even when they pass immediately:** Tasks 4-6 locked in edge case behaviors (no signature, no tests, extends/implements) that were already handled by the main implementation. They prevent future regressions at near-zero cost.
- **Pure function pattern pays off:** Injecting `store` and `projectRoot` makes `symbolCard` trivially testable without mocking the extension framework. All 8 tests are simple setup-call-assert with no async complexity.
- **LSP enrichment is optional at tool time:** `symbol_card` works with whatever edges exist. This is the right default — the graph accumulates knowledge across tool calls, so enrichment from prior `symbol_graph` calls persists automatically.
- **Flat output format vs structured:** The deliberate choice to NOT reuse `formatNeighborhood` keeps the card compact. Relationship counts + top names is the right abstraction for a glance tool — agents can call `symbol_graph` if they need full detail.
