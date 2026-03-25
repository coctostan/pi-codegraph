# Learnings: BM25 Ranked Symbol Search

- **Signature tokenization needs punctuation stripping.** Raw signatures like `foo(store: Store)` tokenize poorly — `foo(store:` becomes a single token. Replacing non-alphanumeric chars with spaces before tokenizing fixed this cleanly.
- **Test data must match tokenizer behavior.** Names like `foo0`, `foo1` don't split on digit boundaries, so a query for `"foo"` won't match `"foo0"`. Using camelCase names (`fooItem0`) that actually produce a `"foo"` token is necessary.
- **BM25 is surprisingly compact.** The full weighted multi-field BM25 implementation (tokenizer + index + search) fits in ~120 lines with no external dependencies. The algorithm is well-suited for in-process symbol search.
- **Fingerprint-based cache invalidation is simple but sufficient.** Using `${nodeCount}:${fileCount}` as a fingerprint catches all typical re-indexing scenarios. Same-count mutations (delete+add) are a theoretical gap but don't occur in practice during re-indexing.
- **Post-scoring filters with over-fetching work well.** Fetching `max(limit*5, 200)` results before applying kind/glob filters avoids needing to integrate filters into the BM25 index while still returning enough filtered results.
