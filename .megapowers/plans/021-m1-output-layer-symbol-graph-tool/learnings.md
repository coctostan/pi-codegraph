# Learnings: 021-m1-output-layer-symbol-graph-tool

- **Edge direction semantics need explicit tests.** The `getNeighbors("both")` call returns both in and out edges; the code must check `edge.source === node.id` (outgoing) vs `edge.target === node.id` (incoming) to classify them. The initial implementation correctly handled `calls` edges but silently included both directions for `imports`. A test specifically for "incoming imports should not appear in the Imports section" would have caught this before code review.

- **Anchor auto-relocation on edit can create phantom duplicates.** When the `edit` tool auto-relocates an anchor and inserts instead of replaces, you end up with two `else if` branches for the same condition — the first matches but has no body, the second is dead. Always re-read the target section after an auto-relocated edit to verify the result before running tests.

- **Scaffold smoke-tests tie you to placeholder exports.** The `test/output-anchoring.test.ts` test checked for an `anchorResults` export that was only ever an empty stub. Removing the stub broke the test. Better practice: scaffold tests should check for a representative *real* export (e.g., `computeAnchor`) rather than a placeholder name.

- **`require()` in ESM test files is a Bun affordance, not a pattern.** Using `require("../src/indexer/tree-sitter.js")` to grab `sha256Hex` in tool tests creates a cross-layer dependency and bypasses TypeScript checking. The same functionality is two lines with `node:crypto`. Acceptable for now, but worth a cleanup pass before M2.

- **Out-of-bounds line index is a real staleness indicator.** When `node.start_line` exceeds the file's current line count, the file has definitely changed (content was deleted). Returning `stale: true` with `anchor: "file:N:?"` is the right response. This edge case is worth an explicit test.

- **The `formatNeighborhood` signature requiring all four sections is slightly brittle.** As more edge kinds are added in later milestones, callers will need to pass more section arguments. Consider a single `sections: Record<string, NeighborSection>` map in M3+ so the formatter can be extended without a signature change.

- **Per-category independent ranking is a deliberate design choice** that keeps the output predictable: limit=10 means "up to 10 per section," not "10 total." This should be documented at the tool level once it's registered as a pi tool in M1's next task (#022).
