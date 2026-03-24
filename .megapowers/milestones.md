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

## M6: Functionality hardening and correctness — ✅ COMPLETE

**Goal:** Eliminate the concrete correctness problems found in live tool-call testing so the graph is trustworthy in real session reuse, not just in clean tests.

### Issues
- [x] #029 Auto-refresh stale persisted graph on tool invocation
- [x] #030 Make ambiguous symbol handling consistent across `symbol_graph`, `trace`, and `impact`
- [x] #031 `graph_query` rejects basic equality `WHERE` predicates despite Cypher-subset interface
- [x] #032 Phase 1: functionality hardening and correctness (batch)

**Exit criteria met.**

---

## M7: Agent utility and product refinement — ✅ COMPLETE

**Goal:** Improve the product as an agent tool, not just as a technically complete graph engine.

### Issues
- [x] #033 Strengthen `trace` as an agent-oriented path tool
- [x] #034 Add higher-value agent reasoning affordances
- [x] #035 Improve graph trust, freshness transparency, and persisted-session ergonomics
- [x] #036 Refine `graph_query` and opinionated graph inspection UX
- [x] #037 Tool input validation gaps
- [x] #038 Readonly database resilience
- [x] #039 symbol_graph dedup
- [x] #040 symbol_graph all edge kinds
- [x] #041 trace branching
- [x] #042 impact not-found diagnostics
- [x] #043 impact addition explanation
- [x] #044 delete_edge tool
- [x] #045 graph_query error messages
- [x] #046 Tool output quality batch
- [x] #047 impact empty output diagnostics

**Exit criteria met.**

---

## M8: Contracts and symbol cards — 🔶 NEXT

**Goal:** Turn codegraph from a dependency browser into a verification input. Extract type signatures, expose compact symbol cards, and mine behavioral contracts from types and test assertions.

### Issues
- [x] #048 Type signature extraction from tree-sitter AST
- [x] #049 `symbol_card` tool: compact symbol summary for agent consumption
- [ ] #050 `symbol_contract` tool: extract behavioral evidence from types and tests
- [ ] #051 M8: Contracts and symbol cards (batch)

### Build order
1. #048 Type signature extraction (data layer)
2. #049 symbol_card (assembly of existing data + signatures)
3. #050 symbol_contract (new extraction: error paths, test assertion mining)

### Exit criteria
- A symbol can answer: what it takes in, what it returns, what tests cover it, what invariants hold
- `symbol_card` returns a compact fact sheet in one call
- `symbol_contract` returns behavioral evidence mined from types and test assertions
- Type signatures are extracted and persisted for functions, classes, and interfaces

---

## Sequencing summary

- **Completed:** M0 → M7 (47 issues)
- **Immediate next milestone:** M8 (contracts and symbol cards)

This repo is in a **post-v1 capability expansion phase** — shifting from "build the graph engine" to "make it a verification input for agent workflows."