# Brainstorm: BM25 Ranked Symbol Search

## Goal

Agents currently need exact symbol names to use codegraph tools (`symbol_graph`, `symbol_card`, etc.), forcing fallback to grep when names are unknown or approximate. Add a standalone `symbol_search` tool that accepts a free-text query, tokenizes it (splitting camelCase/snake_case), scores all graph symbols using BM25 over weighted fields (name, signature, file path), and returns a ranked top-N list with scores, kinds, files, and lines. This removes the exact-name bottleneck and keeps agents inside the graph.

## Mode

`Direct requirements` — the issue description already specifies the algorithm (BM25), the fields and weights, the output shape, and the caching strategy. No design ambiguity remains.

## Must-Have Requirements

- **R1:** New standalone `symbol_search` tool registered in the pi extension, separate from `graph_query`.
- **R2:** Query tokenization splits input on camelCase boundaries, snake_case boundaries, and whitespace.
- **R3:** BM25 scoring over three document fields with weights: symbol name (3×), signature (2×), file path (1×).
- **R4:** Returns top-N results (default N=20), each with: symbol name, BM25 score, kind, file, start line.
- **R5:** Optional filter by symbol kind (e.g. `kind: "function"`).
- **R6:** Optional filter by file glob (e.g. `file: "src/graph/**"`).
- **R7:** BM25 index built lazily on first search call and cached in memory for the session (not persisted to disk).
- **R8:** Index invalidated and rebuilt when the graph is re-indexed (content hash changes).
- **R9:** Output is structured (not prose) — consistent with existing tool output conventions.

## Optional / Nice-to-Have

- **O1:** Include signature snippet in each result row for quick assessment without a follow-up call.
- **O2:** Support `CONTAINS`-style substring matching as a fallback when BM25 returns zero results.

## Explicitly Deferred

- **D1:** Embedding-based / vector semantic search (roadmap "future" item).
- **D2:** Searching edge evidence or test assertion text — scope is symbol nodes only.
- **D3:** Persisting the BM25 index to SQLite (in-memory cache is sufficient for v1).

## Constraints

- **C1:** No new external dependencies — BM25 scoring implemented in-project (the algorithm is ~50 lines).
- **C2:** Must work with existing SQLite graph store; reads nodes via `queryRows` or existing store methods.
- **C3:** TypeScript / Bun runtime, consistent with the rest of the codebase.
- **C4:** Tool output should follow existing structured output patterns (no hashline anchoring needed for search results — just name/score/kind/file/line).

## Open Questions

None.

## Recommended Direction

Implement BM25 as a small self-contained module (`src/tools/bm25.ts` or `src/search/bm25.ts`) with: a tokenizer that splits camelCase and snake_case into lowercase terms, a `BM25Index` class that ingests documents (one per graph node) with weighted fields, and a `search(query)` method returning scored results.

The `symbol_search` tool (`src/tools/symbol-search.ts`) loads all nodes from the store on first invocation, builds the BM25 index, caches it, and queries it. Filters (kind, file glob) are applied post-scoring to keep the index simple. The cache is invalidated by comparing a generation counter or content hash summary against the graph store state.

Wire the tool into `src/index.ts` alongside the existing tools. The tool accepts `{ query: string, kind?: NodeKind, file?: string, limit?: number }` and returns a ranked array.

## Testing Implications

- Unit tests for the tokenizer: camelCase splitting, snake_case splitting, mixed input, single-word input.
- Unit tests for BM25 scoring: term frequency, inverse document frequency, field weighting, multi-term queries.
- Integration test: index a small graph, search by partial name, verify correct symbol ranks highest.
- Filter tests: kind filter excludes non-matching kinds, file glob filter narrows results.
- Cache invalidation test: modify graph, verify index rebuilds on next search.
- Edge cases: empty query, query with no matches, single-node graph.
