## Goal
Unify pi-codegraph’s hashline anchor format with pi-hashline-readmap so anchors emitted by `symbol_graph`, `impact`, `trace`, and source snippets are byte-compatible with the `edit` tool’s `LINE:HASH` parser. The current issue should make codegraph anchors parser/hash-compatible and accurately documented, while deferring true edit-without-any-prior-file-anchoring until pi-hashline-readmap exposes a public way for other tools to mark files as anchored in-session.

## Mode
Direct requirements.

The issue already defines the desired behavior, acceptance criteria, affected files, and out-of-scope boundaries. The main clarification was scope: pi-codegraph can fix anchor shape and hash compatibility now, but pi-hashline-readmap’s separate read-before-edit gate should not be worked around inside this issue.

## Must-Have Requirements
R1. `computeAnchor` or its replacement must compute line hashes byte-identically to pi-hashline-readmap’s `computeLineHash` for the same input line.

R2. The line hash algorithm must strip a trailing `\r`, remove all whitespace with `line.replace(/\s+/g, "")`, hash with xxhash32 seed `0`, apply modulo `16 ** 3`, and render exactly three lowercase hex characters padded with leading zeroes.

R3. Editable anchor tokens emitted by pi-codegraph must match `^\d+:[0-9a-f]{3}$`.

R4. Tool output must not embed the file path inside the editable anchor token.

R5. Tool output that needs file context must render the file path as a separate adjacent field from the bare `LINE:HASH` anchor.

R6. Anchors printed by `symbol_graph`, `impact`, and `trace` must be directly compatible with pi-hashline-readmap’s `set_line.anchor`, `replace_lines.start_anchor`, `replace_lines.end_anchor`, and `insert_after.anchor` fields for the corresponding file once that file is anchored in-session.

R7. `symbol_graph` ambiguity and not-found-with-alternatives output must use the new file-separated anchor format for candidate symbols.

R8. `symbol_graph({ include: ["source"] })` source snippets must use the same pi-hashline-readmap-compatible hash algorithm.

R9. Existing stale detection behavior must be preserved: anchors should be computed from current file contents, while `[stale]` continues to reflect file-level content hash mismatch.

R10. Missing files, out-of-range node lines, and unavailable source must remain clearly marked stale or unavailable and must not be disguised as valid editable anchors.

R11. `xxhash-wasm` must be added and initialized safely before any anchor computation that depends on it.

R12. The anchor helper may remain synchronous after initialization by caching the initialized xxhash function in module scope.

R13. Tests must prove the local pi-codegraph hash implementation matches pinned pi-hashline-readmap-compatible golden vectors on representative lines.

R14. Tests must assert rendered editable anchor tokens match `^\d+:[0-9a-f]{3}$`.

R15. Tests must cover rendered output updates for `symbol_graph`, `impact`, `trace`, ambiguity/candidate output, and source snippets.

R16. Documentation must stop claiming `file:line:hash` as the editable anchor format and instead describe the shared pi-hashline-compatible `LINE:HASH` anchor token accurately.

R17. README wording must not promise edit-without-rereading unless the separate pi-hashline-readmap read-before-edit gate is actually satisfied.

R18. `ARCHITECTURE.md` and any other internal docs that describe the old anchor format must be updated.

## Optional / Nice-to-Have
O1. Include `LINE:HASH|content` for source snippets or other places where the extra content materially improves edit mismatch recovery.

O2. If pi-hashline-readmap later exports a stable hash helper, consider importing it instead of maintaining a local equivalent implementation.

O3. Add a small shared internal formatter type, such as `{ file, anchor, stale }`, to make future output formatting less error-prone.

O4. Add a future cross-package integration test once pi-hashline-readmap exposes a stable public testing/export surface for hashline helpers.

## Explicitly Deferred
D1. Changing SQLite node `content_hash` storage away from whole-file SHA hashing is deferred.

D2. Replacing the freshness, Trust, or stale-edge system is deferred.

D3. Modifying pi-hashline-readmap itself is deferred.

D4. Adding a public pi-hashline-readmap hook/event such as `hashline:note-file-anchored` is deferred to a follow-up issue.

D5. Delivering true “edit without any prior read/grep/ast_search/write anchoring” is deferred until pi-hashline-readmap exposes a supported cross-tool file-anchoring mechanism.

D6. Importing pi-hashline-readmap internals such as `src/hashline.ts` directly from pi-codegraph tests or runtime code is deferred because that API is not exported and would be brittle.

D7. Preserving backward compatibility for the old `file:line:hash` token format is deferred unless a concrete downstream dependency is found.

D8. Broader output redesign beyond anchor formatting is deferred.

## Constraints
C1. The graph schema and stored node/edge content hashes must remain unchanged.

C2. File-level SHA hashes used for incremental indexing and stale detection are separate from line-level edit anchors and must stay separate.

C3. The implementation must respect M10’s public-surface refocus; this issue should change output compatibility, not add new public tools.

C4. pi-codegraph output must remain agent-readable and compact.

C5. `computeAnchor` currently has many callers, so migration should avoid duplicating anchor-format logic across tools.

C6. pi-hashline-readmap’s package root does not currently export `computeLineHash` or `ensureHashInit`; direct import from package internals must not be required for this issue.

C7. pi-hashline-readmap’s `edit` tool validates more than anchor shape: it also requires the target file to have been read or anchored in-session.

C8. Documentation must not overpromise “edit without re-reading” unless the read-before-edit gate is also satisfied.

C9. The local hash implementation must mirror pi-hashline-readmap’s documented/source-observed algorithm closely enough that future drift is easy to detect and review.

## Open Questions
None.

## Recommended Direction
Implement a small hashline compatibility layer inside pi-codegraph, likely in `src/output/anchoring.ts` or a sibling module, that mirrors pi-hashline-readmap’s hash algorithm exactly. Add `ensureHashInit()` for `xxhash-wasm`, cache the resolved hasher, and make all anchor-producing paths depend on that single helper.

Change `AnchorResult` or introduce a companion render helper so callers can render file path and editable anchor separately. The display shape should become something like `src/auth.ts  42:a3f  validateToken  function`, not `src/auth.ts:42:a3f`. This preserves file context for agents while making the anchor token directly compatible with pi-hashline-readmap’s `parseLineRef`.

Update source snippets to use the same hashing helper. Source snippets already use `LINE:HASH|content`, so they are structurally close; the key change is switching from 4-char SHA over `trim()` to 3-char xxhash over whitespace-stripped content.

Do not import pi-hashline-readmap internals for this slice. Instead, pin the compatibility behavior with local golden-vector tests and document that the implementation mirrors `pi-hashline-readmap/src/hashline.ts`. Also revise README wording so it claims shared anchor-format compatibility, not full edit-without-rereading, until pi-hashline-readmap exposes a supported cross-tool way to mark files as anchored in-session.

## Testing Implications
- Add RED tests for the local hash helper using golden vectors that match pi-hashline-readmap’s algorithm.
- Add RED tests that reject the old `file:line:4hex` shape in rendered public tool output.
- Update unit tests for `formatNeighborhood`, `impact`, `trace`, symbol ambiguity output, and source snippets.
- Add stale-file tests proving `[stale]` behavior still works with the new anchor format.
- Add missing-file/out-of-range tests proving invalid locations do not produce valid-looking editable anchors.
- Add a compatibility test showing a pi-codegraph-emitted `LINE:HASH` anchor would satisfy pi-hashline-readmap’s parser/hash expectations for the corresponding file line.
- Run `bun test` and `bun run check`.
