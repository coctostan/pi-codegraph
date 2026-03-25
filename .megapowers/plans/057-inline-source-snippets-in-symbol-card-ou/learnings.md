# Learnings — #057 Inline source snippets in symbol_card

- **Extracting utilities early pays off.** Creating `readSourceSnippet` as a standalone utility in `src/output/source.ts` made the symbol_card integration trivial (one function call) and keeps the door open for `symbol_contract` or other tools to reuse it later.
- **Documentation tests are still valuable.** Tasks 2–5 and 7–10 all passed immediately because the implementation in Task 1/6 already covered the edge cases. But having explicit tests for each degradation path (missing file, null end_line, stale hash) serves as living documentation and regression guards.
- **Neighbor signatures from graph data avoid disk I/O.** Using `GraphNode.signature` (already indexed) instead of reading neighbor source files keeps the feature fast and avoids N+1 file reads. Good design decision from brainstorm.
- **`sha256Hex` is duplicated 3x across the codebase** (`tree-sitter.ts`, `anchoring.ts`, `source.ts`). This pre-existed but is worth a future cleanup to extract into a shared utility.
- **The hashline format (`LINE:HASH|content`) matching pi's `read` tool was critical.** Without format compatibility, agents couldn't use `edit` anchors from `symbol_card` output. Verified the hash computation (sha256 of trimmed content, sliced to 4 chars) matches exactly.
