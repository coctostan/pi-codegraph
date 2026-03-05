# Milestones

## M0: Foundation
Project scaffolding, graph store, and basic structure extraction.
- Project setup: TypeScript, bun, test framework
- Graph store abstraction + SQLite implementation
- Node and edge types with provenance model
- Stage 1 indexer: tree-sitter → function/class/interface/module nodes
- Stage 1 indexer: import extraction → `imports` edges
- Stage 1 indexer: direct call extraction → `calls` edges (name-matched)
- Incremental indexing: content hash per file, skip unchanged
- Validate: index a real TypeScript project, verify graph correctness

## M1: `symbol_graph` + `resolve_edge`
First two tools — the core loop: query the graph, see holes, fill them.
- `symbol_graph` tool: anchored neighborhood for a symbol
- Output layer: hashline anchoring for every node
- Result ranking: top N by confidence, omission counts
- `resolve_edge` tool: agent writes an edge with evidence
- Edge persistence and invalidation (content hash)
- Unresolved edge display with candidates
- pi extension wiring: register tools, handle invocations

## M2: LSP Integration
Stage 2 indexing via tsserver. Graph accuracy jumps.
- tsserver spawning and lifecycle management
- Go-to-definition for unresolved call targets
- Find-references for missed callers
- Upgrade tree-sitter edges to lsp edges
- Interface → implementation resolution
- Lazy resolution: only query LSP for symbols actually queried

## M3: `impact` + Framework Rules
Change impact analysis and framework-aware indexing.
- `impact` tool: classified dependents (breaking/behavioral/safe)
- Signature change detection (arity, param types, return type)
- Transitive impact propagation with depth tracking
- Stage 3 indexer: ast-grep framework rule engine
- Bundled rules: Express routes, React component renders
- User-defined rule loading from project config
- Endpoint nodes from framework rules

## M4: `trace` + Test Coverage
Real execution paths from test coverage.
- Stage 4 indexer: V8 coverage JSON parser
- Map coverage function ranges to graph nodes
- `tested_by` edge creation
- Trace path reconstruction: ordered execution per test
- `trace` tool: anchored execution path from entry point
- Fallback static trace with fork points at interfaces

## M5: `graph_query` + Co-Change + Polish
Power queries, git signals, production readiness.
- `graph_query` tool: Cypher-to-SQL translator (subset)
- Stage 5 indexer: git log co-change analysis
- Co-change edges (file-level, symbol-level stretch)
- Index statistics and staleness reporting
- Performance profiling on large projects (1000+ files)
- Edge case hardening: re-exports, barrel files, aliased imports
