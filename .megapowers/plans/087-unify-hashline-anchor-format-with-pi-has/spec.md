## Goal
Build pi-codegraph hashline output compatibility with pi-hashline-readmap by changing codegraph’s editable anchor tokens from `file:line:hash` with 4-char SHA hashes to file-separated `LINE:HASH` tokens with pi-hashline-readmap-compatible 3-char xxhash hashes, while preserving freshness/staleness behavior and accurately documenting that true edit-without-prior-file-anchoring remains out of scope.

## Acceptance Criteria
1. pi-codegraph provides a single local line-hash helper that mirrors pi-hashline-readmap’s algorithm: strip one trailing `\r`, remove all whitespace with `line.replace(/\s+/g, "")`, xxhash32 with seed `0`, modulo `16 ** 3`, and render exactly three lowercase hex characters padded with leading zeroes.

2. The local line-hash helper is covered by golden-vector tests for representative lines, including whitespace-only differences and CRLF/trailing-`\r` input.

3. `xxhash-wasm` is added as a runtime dependency and initialized through a shared `ensureHashInit()`-style path before any hashline-compatible anchor is computed.

4. The anchor computation path may remain synchronous after initialization by caching the initialized xxhash function in module scope, and it fails clearly if used before initialization.

5. `computeAnchor(node, projectRoot)` computes the editable anchor from the current on-disk content at `node.start_line`, not from indexed/stored source text.

6. For a fresh file, `computeAnchor(node, projectRoot)` returns `stale: false` and an editable anchor token matching `^\d+:[0-9a-f]{3}$`.

7. For a changed file whose whole-file content hash differs from `node.content_hash`, `computeAnchor(node, projectRoot)` still computes the editable anchor from the current line content and returns `stale: true`.

8. For missing files, out-of-range `start_line`, or otherwise unavailable line content, `computeAnchor(node, projectRoot)` returns `stale: true` and must not emit a valid-looking editable anchor token matching `^\d+:[0-9a-f]{3}$`.

9. `formatNeighborhood` renders the symbol header and neighbor rows with file path and editable anchor as separate adjacent fields, e.g. `src/a.ts  10:abc`, and no rendered editable anchor token embeds the file path.

10. `symbolGraph` ambiguity and candidate-match outputs render candidate file paths separately from bare editable anchors.

11. `impact` output renders each affected symbol with file path and bare editable anchor as separate adjacent fields, while preserving classification, depth, stale marker, and “why” signal text.

12. `trace` output renders each trace step and file-scoped miss candidate with file path and bare editable anchor as separate adjacent fields, while preserving mode headers, symbol names, kinds, role tags, and stale markers.

13. `readSourceSnippet(node, projectRoot, maxLines?)` renders source lines as `LINE:HASH|content` using the same pi-hashline-readmap-compatible hash helper.

14. `readSourceSnippet` preserves existing guard behavior: it returns `null` when `end_line` is missing, the file is missing, or the requested line range is invalid.

15. Public tool output tests assert that rendered editable anchor tokens match `^\d+:[0-9a-f]{3}$` and do not contain the old `file:line:4hex` shape.

16. Compatibility tests demonstrate that a pi-codegraph-emitted `LINE:HASH` token satisfies pi-hashline-readmap’s parser/hash expectations for the corresponding file line, without importing pi-hashline-readmap internals.

17. Runtime code and tests must not import pi-hashline-readmap internal files such as `src/hashline.ts`.

18. README documentation replaces `file:line:hash` claims with the new shared `LINE:HASH` editable-anchor token format and keeps file path described as separate context.

19. README documentation must not claim “edit without re-reading” or equivalent unless it also states the pi-hashline-readmap read-before-edit/file-anchoring gate still applies.

20. `ARCHITECTURE.md` and other repo docs that describe the old anchor format are updated to distinguish file-level SHA content hashes from line-level edit anchors.

## Out of Scope
- Changing SQLite node or edge schema.
- Changing stored whole-file `content_hash` semantics.
- Replacing the freshness, Trust, stale-edge, or incremental-indexing systems.
- Modifying pi-hashline-readmap.
- Adding a public pi-hashline-readmap hook/event such as `hashline:note-file-anchored`.
- Delivering true “edit without any prior read/grep/ast_search/write anchoring.”
- Importing pi-hashline-readmap internals directly.
- Preserving backward compatibility for the old `file:line:hash` editable-token shape.
- Adding new public pi-codegraph tools.
- Broader output redesign beyond anchor formatting.
- Cross-package integration tests that require a future stable pi-hashline-readmap exported testing surface.

## Open Questions
None.

## Requirement Traceability
- R1 -> AC 1, AC 2, AC 16
- R2 -> AC 1, AC 2
- R3 -> AC 6, AC 15
- R4 -> AC 9, AC 15
- R5 -> AC 9, AC 11, AC 12
- R6 -> AC 16
- R7 -> AC 10
- R8 -> AC 13
- R9 -> AC 5, AC 7, AC 11, AC 12
- R10 -> AC 8, AC 14
- R11 -> AC 3
- R12 -> AC 4
- R13 -> AC 2
- R14 -> AC 15
- R15 -> AC 9, AC 10, AC 11, AC 12, AC 13, AC 15
- R16 -> AC 18, AC 19
- R17 -> AC 19
- R18 -> AC 20
- O1 -> AC 13 for source snippets; otherwise Out of Scope for broader output locations
- O2 -> Out of Scope
- O3 -> Implementation option; not required by acceptance criteria
- O4 -> Out of Scope
- D1 -> Out of Scope
- D2 -> Out of Scope
- D3 -> Out of Scope
- D4 -> Out of Scope
- D5 -> Out of Scope
- D6 -> AC 17, Out of Scope
- D7 -> Out of Scope
- D8 -> Out of Scope
- C1 -> Out of Scope
- C2 -> AC 20, Out of Scope
- C3 -> Out of Scope
- C4 -> AC 9, AC 11, AC 12
- C5 -> AC 1, AC 3
- C6 -> AC 17
- C7 -> AC 19, Out of Scope
- C8 -> AC 19
- C9 -> AC 1, AC 2, AC 16
