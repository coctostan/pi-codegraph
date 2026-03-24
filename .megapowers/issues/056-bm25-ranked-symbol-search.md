---
id: 56
type: feature
status: open
created: 2026-03-24T18:17:44.921Z
priority: 3
---
# BM25 ranked symbol search
Inspired by jCodeMunch's `search_symbols` with BM25 ranking. Currently agents must know exact symbol names or use `graph_query` with exact WHERE predicates. There's no fuzzy/ranked search.

Add a search capability that:
- Tokenizes query into terms (split camelCase/snake_case)
- Builds a BM25 index over symbol fields with weights: name (3×), signature (2×), file path (1×)
- Returns top-N ranked results with score, kind, file, line
- Supports optional filters: kind, file glob

Could be a standalone `search` tool or a `mode: "search"` on `graph_query`. The BM25 index can be built lazily on first search and cached in memory for the session.

This removes the exact-name dependency that currently forces agents to fall back to grep when they don't know precise symbol names.
