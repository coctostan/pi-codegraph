# Code Review: BM25 Ranked Symbol Search

## Files Reviewed
- `src/tools/bm25.ts` (new) — tokenizer + BM25Index class
- `src/tools/symbol-search.ts` (new) — symbolSearch function with caching, filtering, glob matching
- `src/index.ts` (modified) — import, schema, reset hook, tool registration
- `test/bm25-tokenizer.test.ts` (new) — 8 tokenizer tests
- `test/bm25-index.test.ts` (new) — 7 BM25 scoring tests
- `test/tool-symbol-search.test.ts` (new) — 6 tool function tests
- `test/tool-symbol-search-filters.test.ts` (new) — 4 filter tests
- `test/tool-symbol-search-cache.test.ts` (new) — 2 cache invalidation tests
- `test/extension-symbol-search.test.ts` (new) — 2 extension wiring tests

## Strengths

- **Clean separation:** `bm25.ts` is a pure, reusable module with no graph dependencies. `symbol-search.ts` handles the graph integration. Good layering.
- **BM25 implementation is correct and compact** (`bm25.ts:87-120`): standard BM25 formula with per-field document frequency, IDF, and length normalization in ~35 lines.
- **Tokenizer handles edge cases well** (`bm25.ts:1-18`): camelCase split, uppercase abbreviation boundaries (`parseJSON`), snake_case, whitespace — all tested.
- **Signature preprocessing** (`bm25.ts:49`): stripping non-alphanumeric chars before tokenizing signatures is a smart fix for `foo(store: Store)` → `["foo", "store", "store"]`.
- **Post-scoring filter pattern** (`symbol-search.ts:79-88`): fetching extra results before filtering avoids the need for pre-filtering the index.
- **Test quality:** Tests are focused, each covering one behavior. Good edge case coverage (empty query, no matches, limit boundaries).

## Findings

### Critical
None.

### Important
None.

### Minor

1. **Fingerprint collision on same-count mutations** (`symbol-search.ts:26-31`): If a node is deleted and a different one added (same total count), fingerprint `${totalNodes}:${totalFiles}` won't change. Acceptable for v1 since re-indexing typically changes counts, but worth noting for future hardening.

2. **`matchGlob` regex escaping** (`symbol-search.ts:69`): The character class `[.+^${}()|[\]\\]` works but is fragile. Consider using a well-known glob-to-regex approach or documenting the supported glob subset. Current implementation handles `*` and `**` which covers the spec's use cases.

3. **`projectRoot` unused in `symbolSearch`** (`symbol-search.ts:77`): The `projectRoot` param is accepted but never used in the function body. It's in the interface for consistency with other tools, which is fine, but could be noted with a comment.

## Recommendations

- For future hardening, consider using a hash of all node IDs or a monotonic generation counter on the store for fingerprinting. Not needed now.

## Assessment
**ready** — Clean implementation, well-tested, follows codebase conventions. No critical or important issues. All 403 tests pass.
