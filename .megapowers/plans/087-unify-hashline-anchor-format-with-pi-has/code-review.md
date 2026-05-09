## Files Reviewed

- `src/output/anchoring.ts` — xxhash initialization, `computeLineHash`, `computeAnchor`, anchor formatting, and neighborhood rendering.
- `src/output/source.ts` — source snippet hashline rendering using the shared line-hash helper.
- `src/index.ts` — public tool execution paths now initialize hashing before rendering anchors.
- `src/tools/symbol-resolution.ts` — ambiguity output anchor formatting.
- `src/tools/symbol-graph.ts` — neighborhood/default card composition and ambiguity output anchor formatting.
- `src/tools/symbol-card.ts` — default card, source section, test rows, and ambiguity anchor rendering.
- `src/tools/symbol-contract.ts` — contract header and ambiguity anchor rendering.
- `src/tools/impact.ts` — affected-symbol output anchor rendering with stale/why signals.
- `src/tools/trace.ts` — coverage/static trace lines and file-scoped miss candidate anchor rendering.
- `package.json`, `bun.lock`, `bunfig.toml`, `test/setup-hash-init.ts` — runtime dependency and test preload plumbing for `xxhash-wasm` initialization.
- `README.md`, `ARCHITECTURE.md`, `VISION.md`, `AGENTS.md` — public docs updated from embedded `file:line:hash` claims to file context plus bare `LINE:HASH` anchors and read-before-edit caveat.
- Anchor/hash tests: `test/output-hashline-compat.test.ts`, `test/output-compute-anchor.test.ts`, `test/output-format-neighborhood.test.ts`, `test/read-source-snippet.test.ts`, `test/hash-init-preload.test.ts`, `test/extension-hash-init.test.ts`.
- Public output regression tests: `test/tool-symbol-resolution-anchor-format.test.ts`, `test/tool-symbol-card-anchor-format.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-trace-static-fallback.test.ts`, plus updated existing symbol graph/card/contract/impact/trace/extension suites.

## Strengths

- The hash helper is centralized and matches the required shape: `ensureHashInit()` caches the wasm hasher (`src/output/anchoring.ts:17`), `xxh32()` fails clearly before initialization (`src/output/anchoring.ts:27`), and `computeLineHash(_lineNumber: number, line: string): string` strips one trailing `\r`, removes whitespace, uses xxhash32 seed `0`, mods to 3 hex chars, and returns the padded dictionary entry (`src/output/anchoring.ts:32`).
- `computeAnchor(node: GraphNode, projectRoot: string): AnchorResult` reads current on-disk file content before computing the editable anchor (`src/output/anchoring.ts:47`), preserves whole-file SHA staleness (`src/output/anchoring.ts:61`), and returns non-editable `?:` anchors for missing/unavailable/out-of-range lines (`src/output/anchoring.ts:50`, `src/output/anchoring.ts:57`, `src/output/anchoring.ts:66`).
- Public extension entry points initialize hashing before any renderer can compute anchors: `symbol_graph` (`src/index.ts:209`), `impact` (`src/index.ts:257`), and `trace` (`src/index.ts:287`). This addresses the async wasm setup without making the render pipeline asynchronous.
- Output formatting is simple and consistent: `formatAnchorLocation(anchor: AnchorResult): string` is the single file-context-plus-bare-anchor formatter (`src/output/anchoring.ts:81`), and shared neighborhood rendering uses it for both headers and rows (`src/output/anchoring.ts:141`, `src/output/anchoring.ts:162`).
- Source snippets now reuse the same hash helper (`src/output/source.ts:47`) and keep existing guard behavior for missing `end_line`, missing file, and invalid ranges (`src/output/source.ts:27`, `src/output/source.ts:30`, `src/output/source.ts:40`).
- Tests are meaningful and cover the important failure modes: golden vectors and pre-init failure (`test/output-hashline-compat.test.ts:4`, `test/output-hashline-compat.test.ts:15`), fresh/stale/unavailable anchor behavior (`test/output-compute-anchor.test.ts:12`, `test/output-compute-anchor.test.ts:50`, `test/output-compute-anchor.test.ts:80`), source snippet guards (`test/read-source-snippet.test.ts:46`, `test/read-source-snippet.test.ts:68`, `test/read-source-snippet.test.ts:189`), public output format regressions (`test/tool-symbol-resolution-anchor-format.test.ts:14`, `test/tool-symbol-card-anchor-format.test.ts:15`), and extension-path hash initialization (`test/extension-hash-init.test.ts:8`).
- Documentation is explicit about the new contract and avoids overclaiming edit-without-read: `README.md` describes file context plus bare `LINE:HASH` (`README.md:23`) and states that pi-hashline-readmap’s read-before-edit/file-anchoring gate still applies (`README.md:25`). `ARCHITECTURE.md` clearly distinguishes whole-file SHA-256 `content_hash` from render-time line anchors (`ARCHITECTURE.md:163`).

## Findings

### Critical

None.

### Important

None.

### Minor

None.

## External Review Disposition

`/codex-review --base main` and `/codex-adversarial-review --base main` were run before this review.

- Rejected: the concern that file-first rendering is not parseable when the whole rendered line is copied. The issue spec explicitly requires file path and editable anchor as separate adjacent fields in the form `src/a.ts  10:abc`; the implementation follows that through `formatAnchorLocation(anchor: AnchorResult): string` (`src/output/anchoring.ts:81`) and the README documents that the bare `LINE:HASH` token is the editable anchor (`README.md:23`).
- Rejected: the concern that synchronous render helpers throwing before `ensureHashInit()` is inherently a defect. The accepted design explicitly allows synchronous anchor computation after initialization and requires clear failure before initialization. Public tool execution initializes first (`src/index.ts:210`, `src/index.ts:257`, `src/index.ts:287`), and the direct precondition is tested (`test/output-hashline-compat.test.ts:15`).
- Rejected as a code finding, retained as a process note: `bunfig.toml` and `test/setup-hash-init.ts` are present in the working tree (`bunfig.toml:1`, `test/setup-hash-init.ts:1`) and the full suite passes with them. They must be included when the workflow commits/publishes the change.
- Reclassified as a non-blocking future consideration: bare-CR-only file normalization. Existing indexer conventions split CRLF via `split(/\r?\n/)`, not bare CR (`src/indexer/tree-sitter.ts:20`), and the acceptance criteria target whitespace-insensitive hashing plus trailing-CR/CRLF compatibility. If the project later decides to support classic bare-CR files, line splitting should be aligned deliberately across indexing and output rather than patched only in `computeAnchor`.

## Recommendations

- Ensure the workflow includes the currently untracked test support files (`bunfig.toml`, `test/setup-hash-init.ts`, and new anchor-format tests) in the final commit/PR; otherwise clean checkouts would not get the test preload.
- Consider a follow-up test documenting CRLF source-snippet display behavior, separate from this issue’s hash compatibility work, so rendered snippet content and line hash behavior remain intentionally aligned.

## Verification Performed

- `symbol_graph` with `include: ["contract"]` was used on `computeLineHash`, `computeAnchor`, and `readSourceSnippet`. The surfaced guards/preconditions are covered by the new tests: pre-init throw, missing file, out-of-range line, missing `end_line`, and invalid source ranges.
- `impact` with `changeType: "signature_change"` was run on the changed public/rendering symbols. The returned breaking/behavioral surface includes `renderSymbolSourceSection`, `renderSymbolCardBody`, `renderSymbolContractBody`, `renderLegacyNeighborhoodBody`, `formatAmbiguousMatches`, trace formatters, `symbolCard`, `symbolContract`, and `piCodegraph`; those dependent families are updated to use `formatAnchorLocation` or the initialized public tool path and are covered by the listed tests.
- `bun run check && bun test` passed: 448 pass, 0 fail, 1335 expectations.

## Assessment

ready

The implementation is cohesive, the public output format is consistently updated, initialization is handled at the extension boundary, stale/fresh semantics are preserved, and the tests exercise both helper-level edge cases and public tool output regressions. No blocking code-quality, architecture, or production-readiness issues were found.
