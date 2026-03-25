# Code Review: Inline source snippets in symbol_card output

## Files Reviewed

- `src/output/source.ts` (new) — `readSourceSnippet` utility, 59 lines
- `src/tools/symbol-card.ts` (modified) — Source section + neighbor signatures, 128 lines
- `src/index.ts` (modified) — Typebox schema + handler wiring, 2 lines changed
- `test/read-source-snippet.test.ts` (new) — 6 tests, 183 lines
- `test/tool-symbol-card-source.test.ts` (new) — 5 tests, 190 lines
- `test/tool-symbol-card-neighbor-sigs.test.ts` (new) — 2 tests, 93 lines

## Strengths

- **Clean extraction:** `readSourceSnippet` in `src/output/source.ts` is well-isolated with a typed return interface (`SourceSnippetResult`) that carries `text`, `stale`, and `truncated` — giving the caller all the information it needs without hidden state.
- **Consistent patterns:** File reading (`existsSync` + `readFileSync`), hash computation, and stale detection follow the exact patterns established in `anchoring.ts` and `symbol_contract.ts`.
- **Graceful degradation:** All null/missing paths return `null` from the utility, and `symbol-card.ts:59-60` renders "source unavailable" — no crashes, no empty sections.
- **Stale marker on the section header** (`symbol-card.ts:55-56`) is a nice touch — agents can see staleness at the section level without scanning individual lines.
- **Neighbor signature display** (`symbol-card.ts:121-124`) is minimal and correct — only emits a line when `signature` exists, avoids noise for unresolved neighbors.
- **Test coverage is thorough:** 13 new tests across 3 files covering happy path, missing file, null end_line, truncation, stale detection, and neighbor signature presence/absence.

## Findings

### Critical

None.

### Important

None.

### Minor

1. **`sha256Hex` duplication** — `src/output/source.ts:8` defines a private `sha256Hex` identical to the one in `src/output/anchoring.ts:13` and `src/indexer/tree-sitter.ts:15`. This is a pre-existing pattern (anchoring.ts already duplicated it). Not introduced by this PR but worth noting — a shared utility extraction would reduce the 3 copies to 1. Not blocking.

2. **Double file read for the same node** — `computeAnchor` (line 37) reads the source file, then `readSourceSnippet` (line 51) reads it again. This is consistent with how `symbol_contract` works and the spec explicitly deferred caching (D3). Acceptable for now.

## Recommendations

- Consider a future issue to extract `sha256Hex` into a shared utility (e.g., `src/util/hash.ts`) to eliminate the 3 copies across `tree-sitter.ts`, `anchoring.ts`, and `source.ts`.

## Assessment

**ready** — Clean, well-tested implementation. Follows established codebase patterns. No bugs, no security concerns, no breaking changes. The two minor notes are pre-existing patterns, not regressions. Ship it.
