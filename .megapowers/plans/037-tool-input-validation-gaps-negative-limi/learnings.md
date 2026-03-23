# Learnings — #037 Tool Input Validation Gaps

- **JavaScript `Array.slice` with negative indices is a silent footgun.** `slice(0, -1)` doesn't error — it returns all but the last element. Any function accepting a numeric limit that feeds into `slice` needs a guard, especially when the limit comes from external input.

- **Validation chains should be exhaustive at the boundary.** `resolveEdge` already validated edge kind, source/target existence, and ambiguity — but missed self-reference and evidence emptiness. When adding a new validation, audit what other invariants the function assumes but doesn't check.

- **The "Fixed When" criteria in the diagnosis are the real acceptance criteria for bugfixes.** Writing them during diagnosis (not planning) forces precision early and prevents scope drift during implementation.

- **Three independent bugs in one issue worked well because all three were small, same-layer, and non-interacting.** If any had been complex or cross-cutting, separate issues would have been cleaner.

- **Case sensitivity matters in assertion strings.** The plan used `"Evidence is required"` (capital E) but `toContain("evidence")` (lowercase e) — caught immediately at GREEN step. Always match the exact casing in both production code and test assertions.
