# Feature: BM25 Ranked Symbol Search

## Summary

Added a `symbol_search` tool that lets agents find graph symbols by approximate name using BM25 ranked scoring. This removes the exact-name dependency that previously forced agents to fall back to grep when they didn't know precise symbol names.

## Problem

All existing codegraph tools (`symbol_graph`, `symbol_card`, `symbol_contract`, etc.) require exact symbol names. When agents don't know the precise name, they must fall back to grep → read chains outside the graph, losing the relationship context the graph provides.

## Solution

A new `symbol_search` tool that:
- Accepts free-text queries and tokenizes them (splitting camelCase, snake_case, whitespace)
- Scores all graph symbols using BM25 over three weighted fields: name (3×), signature (2×), file path (1×)
- Returns ranked top-N results with score, kind, file, line, and signature
- Supports optional filters by symbol kind and file glob pattern
- Builds the BM25 index lazily on first search, caches in memory, and invalidates on graph changes

## Architecture

```
query → tokenize → BM25Index.search() → post-filter (kind/glob) → format output
                        ↑
              lazy build from GraphStore nodes
              cached in memory, invalidated by fingerprint
```

Two new modules:
- `src/tools/bm25.ts` — Pure BM25 engine: tokenizer + `BM25Index` class (no graph dependencies)
- `src/tools/symbol-search.ts` — Graph integration: lazy index building, caching, filtering, output formatting

## Files

| File | Change |
|------|--------|
| `src/tools/bm25.ts` | New — tokenizer + BM25Index class |
| `src/tools/symbol-search.ts` | New — symbolSearch function with caching and filters |
| `src/index.ts` | Modified — tool registration, schema, reset hook |
| `test/bm25-tokenizer.test.ts` | New — 8 tokenizer tests |
| `test/bm25-index.test.ts` | New — 7 BM25 scoring tests |
| `test/tool-symbol-search.test.ts` | New — 6 tool function tests |
| `test/tool-symbol-search-filters.test.ts` | New — 4 filter tests |
| `test/tool-symbol-search-cache.test.ts` | New — 2 cache tests |
| `test/extension-symbol-search.test.ts` | New — 2 extension wiring tests |

## Usage

```
symbol_search({ query: "graph store" })
symbol_search({ query: "addNode", kind: "function" })
symbol_search({ query: "resolver", file: "src/indexer/**", limit: 5 })
```
