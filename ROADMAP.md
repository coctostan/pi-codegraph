# pi-codegraph — Roadmap

## M0: Foundation — ✅ COMPLETE

**Goal:** Project scaffolding, graph store, and basic structure extraction. No tools yet — just the ability to index a TypeScript project into a symbol graph.

- [x] Project setup: TypeScript, bun, test framework _(#001)_
- [x] Graph store abstraction + SQLite implementation _(#002 via batch #019)_
- [x] Node and edge types with provenance model _(#003 via batch #019)_
- [x] Stage 1 indexer: tree-sitter → function/class/interface/module nodes _(#004 via batch #020)_
- [x] Stage 1 indexer: import extraction → `imports` edges _(#004 via batch #020)_
- [x] Stage 1 indexer: direct call extraction → `calls` edges (name-matched) _(#004 via batch #020)_
- [x] Incremental indexing: content hash per file, skip unchanged _(#005 via batch #020)_
- [x] Index a real TypeScript project, validate the graph makes sense _(verified in #020)_

**Exit criteria met:** ✅ Can index a project and query the SQLite database directly to see nodes and edges. The graph is structurally correct for direct calls and imports.

---

## M1: `symbol_graph` + `resolve_edge` — 🔶 IN PROGRESS (2/4 issues done)

**Goal:** First two tools, usable by an agent. The core loop: query the graph, see holes, fill them.

- [x] `symbol_graph` tool: given a symbol name, return anchored neighborhood _(#006 via batch #021)_
- [x] Output layer: hashline anchoring for every node in results _(#007 via batch #021)_
- [x] Result ranking: top N callers/callees by confidence, omission counts _(#007 via batch #021)_
- [ ] `resolve_edge` tool: agent writes an edge with evidence _(#008 — stub only)_
- [ ] Edge persistence and invalidation (content hash check) _(#008)_
- [ ] Unresolved edge display: show candidates + hint for agent resolution _(#008)_
- [ ] pi extension wiring: register tools, handle invocations _(#009 — stub only)_
- [ ] Test: agent uses `symbol_graph` on a real project, sees results, resolves an edge

**Remaining:** Batch #022 (resolve_edge + extension wiring)

**Exit criteria:** An agent can explore a codebase through `symbol_graph`, encounter unresolved edges, and fill them with `resolve_edge`. The graph persists across sessions.

---

## M2: LSP Integration (Week 5-6) — NOT STARTED

**Goal:** Stage 2 indexing. The graph gets dramatically more accurate.

- [ ] tsserver spawning and lifecycle management
- [ ] Go-to-definition queries for unresolved call targets
- [ ] Find-references queries for discovering callers tree-sitter missed
- [ ] Upgrade `tree-sitter` edges to `lsp` edges where LSP confirms them
- [ ] Interface → implementation resolution
- [ ] Lazy resolution: only query LSP for symbols that are actually queried by tools (not full upfront scan)
- [ ] Cache LSP results in the graph store

**Batch:** #023 (LSP integration)

**Exit criteria:** `symbol_graph` returns significantly more complete results for TypeScript projects. Interface calls resolve to concrete implementations. Edge provenance correctly distinguishes `tree-sitter` vs `lsp` sources.

---

## M3: `impact` + Framework Rules (Week 7-8) — NOT STARTED

**Goal:** Change impact analysis and framework-aware indexing.

- [ ] `impact` tool: given changed symbols, return classified dependents (breaking/behavioral/safe)
- [ ] Signature change detection: arity, param types, return type
- [ ] Transitive impact propagation with depth tracking
- [ ] Stage 3 indexer: ast-grep framework rule engine
- [ ] Express route rules (bundled)
- [ ] React component render rules (bundled)
- [ ] User-defined rule loading from project-local config
- [ ] Endpoint nodes derived from framework rules

**Batch:** #024 (impact analysis + ast-grep rule engine)

**Exit criteria:** `impact` gives symbol-level, classified impact analysis. Framework rules create endpoint and route nodes that connect handlers to HTTP methods.

---

## M4: `trace` + Test Coverage (Week 9-10) — NOT STARTED

**Goal:** The killer feature. Real execution paths from test coverage.

- [ ] Stage 4 indexer: V8 coverage JSON parser
- [ ] Map coverage function ranges back to graph nodes
- [ ] `tested_by` edge creation from coverage data
- [ ] Trace path reconstruction from coverage: ordered execution sequence per test
- [ ] `trace` tool: given an entry point, return the anchored execution path
- [ ] Associate traces with endpoint nodes where possible
- [ ] Fallback trace from static analysis when no coverage exists (with fork points at interfaces)

**Batch:** #025 (V8 coverage + trace tool)

**Exit criteria:** Agent runs tests with coverage, then `trace("POST /api/login")` returns the actual ordered execution path. `symbol_graph` shows `test-coverage` edges with highest confidence.

---

## M5: `graph_query` + Co-Change + Polish (Week 11-12) — NOT STARTED

**Goal:** Power query tool, git-based signals, and production readiness.

- [ ] `graph_query` tool: Cypher-to-SQL translator (subset of Cypher sufficient for useful queries)
- [ ] Stage 5 indexer: git log co-change analysis
- [ ] Co-change edges at file level (symbol-level refinement as stretch)
- [ ] Index statistics: node/edge counts by type and source, staleness report
- [ ] Performance profiling on large projects (1000+ files)
- [ ] Documentation: tool usage guide, framework rule authoring guide
- [ ] Edge case hardening: re-exports, barrel files, namespace imports, aliased imports

**Batches:** #026 (Cypher-to-SQL query tool), #027 (git co-change + hardening)

**Exit criteria:** All 5 tools working. Graph built from all 5 layers. Tested on multiple real TypeScript projects.

---

## Future (post-v1)

- **Multi-language support:** Python (pylsp), Go (gopls), Rust (rust-analyzer)
- **MCP adapter:** Expose tools via MCP for use outside pi (Cursor, Claude Code, etc.)
- **Semantic search:** Optional embedding layer for "find code that does X" queries
- **Live mode:** File watcher + incremental re-index on save
- **Cross-repo graphs:** Monorepo support, package boundary awareness
- **Graph visualization:** Debug/inspection UI for the graph (dev tool, not user-facing)

---

## Principles

Throughout all milestones:

1. **Structured output only.** No prose. Numbers, paths, line ranges, booleans, anchors.
2. **Provenance on every edge.** The agent always knows how much to trust a relationship.
3. **Incremental by default.** Never re-index what hasn't changed.
4. **TypeScript first.** Get one language perfect before expanding.
5. **The agent is a collaborator.** Unresolved edges are features, not bugs — they're invitations for the agent to contribute.
