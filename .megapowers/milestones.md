# Milestones

## M0: Foundation — ✅ COMPLETE

All 5 issues done. Full type model, SQLite graph store, tree-sitter indexer, incremental hashing.

### Issues
- [x] #001 Project scaffolding: TypeScript, bun, test framework — **done**
- [x] #002 Graph store abstraction + SQLite implementation — **done** (via batch #019)
- [x] #003 Node and edge types with provenance model — **done** (via batch #019)
- [x] #004 Stage 1 indexer: tree-sitter symbol extraction — **done** (via batch #020)
- [x] #005 Incremental indexing with content hashing — **done** (via batch #020)

### Batch issues
- [x] #019 M0: Type model + store (sources: #003, #002) — **done**
- [x] #020 M0: Tree-sitter indexer + incremental hashing (sources: #004, #005) — **done**

### What's built
- `src/graph/types.ts` (54 lines) — full GraphNode, GraphEdge, Provenance types
- `src/graph/store.ts` (25 lines) — GraphStore interface
- `src/graph/sqlite.ts` (329 lines) — SQLite implementation with schema, CRUD, queries
- `src/indexer/tree-sitter.ts` (278 lines) — symbol extraction, import/call edge creation
- `src/indexer/pipeline.ts` (89 lines) — incremental indexing with content hashing
- 805 lines of tests across 7 test files

---

## M1: `symbol_graph` + `resolve_edge` — 🔶 IN PROGRESS

Output layer and symbol_graph tool are done. resolve_edge and extension wiring remain.

### Issues
- [x] #006 `symbol_graph` tool — **done** (via batch #021)
- [x] #007 Output layer: hashline anchoring and result ranking — **done** (via batch #021)
- [ ] #008 `resolve_edge` tool: agent-written edges with evidence — **open** (stub only)
- [ ] #009 Pi extension wiring: register tools and handle invocations — **open** (stub only)

### Batch issues
- [x] #021 M1: Output layer + symbol_graph tool (sources: #007, #006) — **done** (PR merged)
- [ ] #022 M1: resolve_edge tool + pi extension wiring (sources: #008, #009) — **open**

### What's built
- `src/output/anchoring.ts` (130 lines) — hashline anchoring, result ranking, format
- `src/tools/symbol-graph.ts` (99 lines) — neighborhood query with anchored output
- 632 lines of tests across 4 test files

### What's still stubs
- `src/tools/resolve-edge.ts` (1 line) — empty `resolveEdge()` 
- `src/index.ts` (3 lines) — empty `piCodegraph()` extension entry

### Next up
**#022** — resolve_edge tool + pi extension wiring. Completes M1.

---

## M2: LSP Integration — NOT STARTED
Blocked on M1 completion.

### Issues
- [ ] #010 Stage 2 indexer: tsserver spawning and lifecycle
- [ ] #011 LSP edge resolution: go-to-definition and find-references

### Batch issue
- [ ] #023 M2: LSP integration (sources: #010, #011)

---

## M3: `impact` + Framework Rules — NOT STARTED
Blocked on M2.

### Issues
- [ ] #012 `impact` tool: classified change impact analysis
- [ ] #013 Stage 3 indexer: ast-grep framework rule engine

### Batch issue
- [ ] #024 M3: Impact analysis + ast-grep rule engine (sources: #012, #013)

---

## M4: `trace` + Test Coverage — NOT STARTED
Blocked on M3.

### Issues
- [ ] #014 Stage 4 indexer: V8 test coverage → `tested_by` edges
- [ ] #015 `trace` tool: anchored execution path from entry point

### Batch issue
- [ ] #025 M4: V8 coverage + trace tool (sources: #014, #015)

---

## M5: `graph_query` + Co-Change + Polish — NOT STARTED
Blocked on M4.

### Issues
- [ ] #016 `graph_query` tool: Cypher-to-SQL subset translator
- [ ] #017 Stage 5 indexer: git co-change analysis
- [ ] #018 Edge case hardening and performance profiling

### Batch issues
- [ ] #026 M5: Cypher-to-SQL query tool (sources: #016)
- [ ] #027 M5: Git co-change analysis + hardening (sources: #017, #018)
