# Milestones

## Current state

Core v1 scope is effectively complete through **M5**:
- symbol graph
- resolve edge
- LSP-backed enrichment
- impact analysis
- framework rules
- coverage-backed trace
- graph query
- git co-change

The next work is no longer "build the missing tools". It is:
1. **fix correctness and live-session trust issues**
2. **increase actual utility for coding agents**

---

## M0: Foundation — ✅ COMPLETE

### Issues
- [x] #001 Project scaffolding: TypeScript, bun, test framework
- [x] #002 Graph store abstraction + SQLite implementation
- [x] #003 Node and edge types with provenance model
- [x] #004 Stage 1 indexer: tree-sitter symbol extraction
- [x] #005 Incremental indexing with content hashing

### Batch issues
- [x] #019 M0: Type model + store
- [x] #020 M0: Tree-sitter indexer + incremental hashing

---

## M1: `symbol_graph` + `resolve_edge` — ✅ COMPLETE

### Issues
- [x] #006 `symbol_graph` tool
- [x] #007 Output layer: hashline anchoring and result ranking
- [x] #008 `resolve_edge` tool: agent-written edges with evidence
- [x] #009 Pi extension wiring: register tools and handle invocations

### Batch issues
- [x] #021 M1: Output layer + symbol_graph tool
- [x] #022 M1: resolve_edge tool + pi extension wiring

---

## M2: LSP Integration — ✅ COMPLETE

### Issues
- [x] #010 Stage 2 indexer: tsserver spawning and lifecycle
- [x] #011 LSP edge resolution: go-to-definition and find-references

### Batch issue
- [x] #023 M2: LSP integration

---

## M3: `impact` + Framework Rules — ✅ COMPLETE

### Issues
- [x] #012 `impact` tool: classified change impact analysis
- [x] #013 Stage 3 indexer: ast-grep framework rule engine

### Batch issue
- [x] #024 M3: Impact analysis + ast-grep rule engine

---

## M4: `trace` + Test Coverage — ✅ COMPLETE

### Issues
- [x] #014 Stage 4 indexer: V8 test coverage → `tested_by` edges
- [x] #015 `trace` tool: anchored execution path from entry point

### Batch issue
- [x] #025 M4: V8 coverage + trace tool

---

## M5: `graph_query` + Co-Change + Hardening — ✅ COMPLETE

### Issues
- [x] #016 `graph_query` tool: Cypher-to-SQL subset translator
- [x] #017 Stage 5 indexer: git co-change analysis
- [x] #018 Edge case hardening and performance profiling

### Batch issues
- [x] #026 M5: Cypher-to-SQL query tool
- [x] #027 M5: Git co-change analysis + hardening
- [x] #028 CI fix: sg empty stdout breaks indexProject

---

## M6: Functionality hardening and correctness — 🔶 NEXT

**Goal:** Eliminate the concrete correctness problems found in live tool-call testing so the graph is trustworthy in real session reuse, not just in clean tests.

### Issues
- [ ] #029 Auto-refresh stale persisted graph on tool invocation
- [ ] #030 Make ambiguous symbol handling consistent across `symbol_graph`, `trace`, and `impact`
- [ ] #031 `graph_query` rejects basic equality `WHERE` predicates despite Cypher-subset interface

### Batch issue
- [ ] #032 Phase 1: functionality hardening and correctness

### Exit criteria
- Tools refresh or otherwise correctly reconcile stale persisted graph state
- Ambiguous symbol handling is consistent and non-misleading across tools
- `graph_query` supports or clearly resolves the most basic expected equality-filter workflow
- The real in-session battery passes against both:
  - an existing persisted `.codegraph/graph.db`
  - a fresh clone / fresh DB

---

## M7: Agent utility and product refinement — ⏳ PLANNED

**Goal:** Improve the product as an agent tool, not just as a technically complete graph engine.

### Issues
- [ ] #033 Strengthen `trace` as an agent-oriented path tool with clearer semantics and richer backing data
- [ ] #034 Add higher-value agent reasoning affordances beyond structural graph edges
- [ ] #035 Improve graph trust, freshness transparency, and persisted-session ergonomics
- [ ] #036 Refine `graph_query` and opinionated graph inspection UX for agent workflows

### Recommended execution order
1. [ ] #035 Improve graph trust, freshness transparency, and persisted-session ergonomics
2. [ ] #033 Strengthen `trace` as an agent-oriented path tool with clearer semantics and richer backing data
3. [ ] #034 Add higher-value agent reasoning affordances beyond structural graph edges
4. [ ] #036 Refine `graph_query` and opinionated graph inspection UX for agent workflows

### Exit criteria
- Agents can quickly tell what graph data is current, stale, inferred, or runtime-backed
- `trace` communicates trust level and provides more useful path output for real coding work
- The tool reduces search cost and uncertainty for change planning, review scoping, and test targeting
- Graph inspection UX favors practical agent tasks over theoretical query completeness

---

## Sequencing summary

- **Completed:** M0 → M5
- **Immediate next milestone:** M6
- **Follow-on milestone:** M7

This repo is now in a **post-v1 hardening and utility phase**.
