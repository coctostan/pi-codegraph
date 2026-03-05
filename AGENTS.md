# AGENTS.md — pi-codegraph

## What This Is

A pi extension that builds a symbol-level graph of a TypeScript codebase and exposes it through 5 agent-optimized tools. Not for humans — for coding agents that need to understand cross-file relationships without grep→read chains.

## Architecture

```
Tools → Query Engine → Graph Store (SQLite) → Indexing Pipeline (5 layers)
```

**Graph store:** SQLite with `nodes` and `edges` tables. Nodes are symbols (function, class, interface, module, endpoint, test). Edges carry provenance (source, confidence, evidence, content hash).

**Indexing layers:**
1. tree-sitter — AST parse → nodes + direct call/import edges
2. LSP (tsserver) — resolve references, upgrade edge confidence
3. ast-grep — framework pattern rules (Express routes, React renders, etc.)
4. V8 test coverage — `tested_by` edges, execution traces
5. git co-change — correlated symbol changes from commit history

Incremental: content hashes per file, only re-index what changed.

## Tools

| Tool | Purpose |
|------|---------|
| `symbol_graph` | Given a symbol, return its anchored relationship neighborhood (callers, callees, unresolved) |
| `trace` | Given an entry point (function, endpoint, test), return ordered execution path |
| `impact` | Given changed symbols, return classified dependents (breaking/behavioral/safe) |
| `graph_query` | Freeform Cypher queries against the graph |
| `resolve_edge` | Agent writes an edge with evidence — teaches the graph what static analysis can't see |

All output is hashline-anchored (`file:line:hash`). No prose. Every edge shows provenance.

## Key Design Decisions

- **SQLite over KuzuDB** — simpler, zero deps, sufficient for 1-3 hop traversals. Migrate later if needed.
- **TypeScript only** for v1.
- **No embeddings, no vector search, no external servers.**
- **Agent-resolved edges** are first-class. The graph has explicit holes the agent fills.
- **Output layer** anchors every node to current file content and manages token budgets via ranking/truncation.

## File Layout

```
src/
  index.ts              # pi extension entry
  tools/                # one file per tool
  indexer/              # one file per pipeline stage
  graph/                # store abstraction, SQLite impl, types
  output/               # hashline anchoring, result ranking
  rules/                # bundled framework rule YAMLs
```

## Milestones

- **M0:** Scaffolding + graph store + tree-sitter indexing
- **M1:** `symbol_graph` + `resolve_edge` tools
- **M2:** LSP integration (tsserver)
- **M3:** `impact` + framework rules
- **M4:** `trace` + test coverage
- **M5:** `graph_query` + co-change + polish

## Dev Notes

- Bun runtime, TypeScript
- tree-sitter and ast-grep are already in the pi stack
- LSP is spawned as child process (tsserver), not a library dep
- Every edge has: `source`, `confidence`, `evidence`, `content_hash`, `created_at`
- Stale edges detected by content hash mismatch on source files
