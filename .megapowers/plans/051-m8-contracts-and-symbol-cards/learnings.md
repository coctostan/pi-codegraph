## Learnings — #051 M8 Contracts and Symbol Cards

- Batch close-outs where all source issues are already done require minimal planning — a single no-test verification task is sufficient. Don't over-engineer the plan for pure verification.
- When updating ROADMAP.md status sections, check for stale bullets from previous forward-looking text (e.g. "shifts to verification-grade intelligence" still referencing M8 after M8 is complete).
- The three-issue build order (#048 → #049 → #050) worked well — each issue cleanly built on the prior one's data layer without circular dependencies.
- 27 dedicated M8 tests across the three issues provided strong coverage of edge cases (ambiguous, not-found, no-tests, no-signature, generics) — good test design pattern to replicate.
- Contract extraction as on-demand tree-sitter parsing (rather than a persistent indexer stage) was the right call — keeps the index lean and avoids staleness for rarely-queried data.
