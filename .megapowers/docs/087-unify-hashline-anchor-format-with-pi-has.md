# 087 — Hashline Anchor Format Compatibility

## Summary

pi-codegraph now emits editable line anchors in the same bare `LINE:HASH` shape used by pi-hashline-readmap, while keeping file paths as separate context. Public output that previously looked like `src/a.ts:10:abcd` now renders as adjacent fields such as `src/a.ts  10:abc`.

This fixes the mismatch between codegraph's old file-embedded, 4-character SHA-derived anchor tokens and pi's hashline parser/hash expectations. It preserves whole-file SHA-256 `content_hash` staleness semantics and explicitly does not bypass pi-hashline-readmap's normal read-before-edit/file-anchoring gate.

## What changed

- Added a local pi-hashline-compatible line hash helper backed by `xxhash-wasm`.
  - `ensureHashInit(): Promise<void>` initializes and caches the wasm hash function.
  - `computeLineHash(_lineNumber: number, line: string): string` strips one trailing `\r`, removes whitespace, hashes with xxhash32 seed `0`, mods into `16 ** 3`, and returns exactly three lowercase hex characters.
- Changed `computeAnchor(node: GraphNode, projectRoot: string): AnchorResult` to compute bare editable anchors from current on-disk line content at `node.start_line`.
  - Fresh files return `stale: false` with anchors like `10:abc`.
  - Changed files still compute the current line's editable anchor but return `stale: true`.
  - Missing files, unreadable files, and out-of-range lines return stale non-editable anchors like `10:?`.
- Added `formatAnchorLocation(anchor: AnchorResult): string` as the shared renderer for file context plus bare anchor.
- Updated `symbol_graph`, `impact`, and `trace` public output paths to render file paths separately from bare editable anchors.
- Updated ambiguity/candidate outputs, symbol card/contract surfaces, neighborhood rows, impact rows, trace rows, and file-scoped miss suggestions to avoid the old `file:line:4hex` token shape.
- Updated `readSourceSnippet(node: GraphNode, projectRoot: string, maxLines?: number): SourceSnippetResult | null` to render source as `LINE:HASH|content` using the same hash helper.
- Added test preload support so direct synchronous renderer tests run after `ensureHashInit()`.
- Updated README, architecture, vision, and agent docs to distinguish line-level editable anchors from whole-file SHA `content_hash` values and to document the read-before-edit caveat.

## Modified API / helper surface

Confirmed signatures from the code graph:

```ts
ensureHashInit(): Promise<void>
computeLineHash(_lineNumber: number, line: string): string
computeAnchor(node: GraphNode, projectRoot: string): AnchorResult
readSourceSnippet(node: GraphNode, projectRoot: string, maxLines?: number): SourceSnippetResult | null
```

The exported helpers remain synchronous after hash initialization. Calling `computeLineHash` before `ensureHashInit()` fails clearly with `Hash not initialized — call ensureHashInit() first`.

## Output contract

Editable locations are rendered as:

```text
<file path>  <LINE:HASH>
```

Examples:

```text
src/output/anchoring.ts  32:0a5  computeLineHash  function
src/tools/impact.ts  239:d4b  impact  breaking  depth:1  [fan-in:...]
```

Only the bare `LINE:HASH` part is the editable anchor token. The file path is adjacent context. Agents still need the target file to be anchored through pi's normal read/grep/ast_search/write gate before editing.

Source snippets render as:

```text
LINE:HASH|content
```

## Verification

Full verification passed:

```text
bun run check && bun test
448 pass
0 fail
1335 expect() calls
```

Targeted symptom reproduction also passed across anchor computation, neighborhood rendering, symbol resolution, symbol card/contract output, impact output, trace output, and source snippets:

```text
bun test test/output-compute-anchor.test.ts \
  test/output-format-neighborhood.test.ts \
  test/tool-symbol-resolution-anchor-format.test.ts \
  test/tool-symbol-card-anchor-format.test.ts \
  test/tool-impact-output-signals.test.ts \
  test/tool-trace-static-fallback.test.ts \
  test/read-source-snippet.test.ts
24 pass
0 fail
```

## PR description draft

### Summary

This makes pi-codegraph's rendered editable anchors compatible with pi-hashline-readmap by replacing old embedded `file:line:4hex` locations with file context plus a bare `LINE:HASH` token, for example `src/a.ts  10:abc`.

The new line hash helper mirrors pi-hashline-readmap's algorithm locally: strip one trailing `\r`, remove all whitespace, xxhash32 seed `0`, modulo `16 ** 3`, and render three lowercase hex characters. Whole-file SHA-256 `content_hash` staleness stays unchanged.

### What changed

- Added `xxhash-wasm` and shared `ensureHashInit()` initialization for hashline-compatible anchor computation.
- Added `computeLineHash(_lineNumber, line)` golden-vector coverage, including whitespace-insensitive and trailing-CR cases.
- Updated `computeAnchor()` to read current on-disk line content and return bare anchors such as `2:c27` plus `stale` state.
- Updated public `symbol_graph`, `impact`, and `trace` output to render file paths separately from bare anchors.
- Updated source snippets to render `LINE:HASH|content` with the same helper.
- Added public-output regression tests proving the old `file:line:4hex` shape is gone.
- Updated docs to explain the new anchor shape and clarify that pi's read-before-edit/file-anchoring gate still applies.

### Verification

- `bun run check && bun test` — 448 pass, 0 fail; `tsc --noEmit` passed.
- Targeted anchor-output reproduction — 24 pass, 0 fail.
- `symbol_graph`, `impact`, and `trace` inspection confirmed the changed helper/output paths and dependent surfaces.
