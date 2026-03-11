# pi-codegraph — Roadmap

## Status

Core v1 is effectively complete:
- M0 Foundation
- M1 `symbol_graph` + `resolve_edge`
- M2 LSP integration
- M3 `impact` + framework rules
- M4 `trace` + coverage
- M5 `graph_query` + git co-change + hardening

The roadmap now shifts from **feature existence** to two new goals:
1. **M6: functionality hardening and correctness**
2. **M7: agent utility and product refinement**

---

## M0: Foundation — ✅ COMPLETE

**Goal:** Project scaffolding, graph store, and basic structure extraction.

- [x] Project setup: TypeScript, bun, test framework _(#001)_
- [x] Graph store abstraction + SQLite implementation _(#002 via batch #019)_
- [x] Node and edge types with provenance model _(#003 via batch #019)_
- [x] Stage 1 indexer: tree-sitter symbol extraction and structural edges _(#004 via batch #020)_
- [x] Incremental indexing: content hash per file _(#005 via batch #020)_

**Exit criteria met:** Can index a project and inspect nodes/edges reliably in SQLite.

---

## M1: `symbol_graph` + `resolve_edge` — ✅ COMPLETE

**Goal:** First agent-usable tools.

- [x] `symbol_graph` tool _(#006 via batch #021)_
- [x] Output layer: hashline anchoring and ranking _(#007 via batch #021)_
- [x] `resolve_edge` tool _(#008 via batch #022)_
- [x] pi extension wiring _(#009 via batch #022)_

**Exit criteria met:** Agents can inspect neighborhoods and persist agent-authored edges with evidence.

---

## M2: LSP Integration — ✅ COMPLETE

**Goal:** Increase graph accuracy beyond tree-sitter alone.

- [x] tsserver lifecycle and request handling _(#010 via batch #023)_
- [x] definition/reference-based enrichment _(#011 via batch #023)_
- [x] interface/implementation resolution
- [x] lazy tool-time LSP enrichment paths

**Exit criteria met:** Tool results incorporate higher-confidence LSP-backed relationships where available.

---

## M3: `impact` + Framework Rules — ✅ COMPLETE

**Goal:** Symbol-level impact analysis and framework-aware indexing.

- [x] `impact` tool _(#012 via batch #024)_
- [x] ast-grep framework rule engine _(#013 via batch #024)_
- [x] Express route rules
- [x] React render rules

**Exit criteria met:** Agents can ask what downstream code is affected and see framework-derived edges.

---

## M4: `trace` + Test Coverage — ✅ COMPLETE

**Goal:** Coverage-backed execution-path tooling.

- [x] coverage parsing and node mapping _(#014 via batch #025)_
- [x] `tested_by` edge creation _(#014 via batch #025)_
- [x] `trace` tool _(#015 via batch #025)_
- [x] static fallback path selection

**Exit criteria met:** Agents can retrieve one anchored path from tests, symbols, or endpoints, using runtime-backed data when available.

---

## M5: `graph_query` + Co-Change + Hardening — ✅ COMPLETE

**Goal:** Power-user query path, git signals, and production hardening.

- [x] `graph_query` tool _(#016 via batch #026)_
- [x] git co-change analysis _(#017 via batch #027)_
- [x] hardening and edge-case coverage _(#018 via batch #027)_
- [x] CI hardening for sg empty-stdout behavior _(#028)_

**Exit criteria met:** All five core tools exist and are tested across the implemented indexing layers.

---

## M6: Functionality hardening and correctness — 🔶 NEXT

**Goal:** Fix the concrete live-session problems uncovered by real tool-call testing.

### Scope
- [ ] Auto-refresh stale persisted graph on tool invocation _(#029)_
- [ ] Make ambiguous symbol handling consistent across `symbol_graph`, `trace`, and `impact` _(#030)_
- [ ] Improve `graph_query` support/ergonomics for basic equality `WHERE` predicates _(#031)_
- [ ] Deliver as batch _(#032)_

### Why this milestone exists
The system is feature-complete enough to be useful, but real-session testing showed trust gaps:
- stale persisted graph state can leak into tool results
- ambiguity handling is inconsistent across tools
- graph-query ergonomics are narrower than the contract implies

### Exit criteria
- Existing `.codegraph/graph.db` state does not silently degrade tool correctness
- Ambiguous symbol behavior is explicit and consistent
- Basic graph inspection queries work with low surprise
- A live battery of real tool calls passes on both stale-state and fresh-state scenarios

---

## M7: Agent utility and product refinement — ⏳ PLANNED

**Goal:** Improve actual value to coding agents beyond simple structural completeness.

### Scope
- [ ] Strengthen `trace` as an agent-oriented path tool with clearer semantics and richer backing data _(#033)_
- [ ] Add higher-value agent reasoning affordances beyond structural graph edges _(#034)_
- [ ] Improve graph trust, freshness transparency, and persisted-session ergonomics _(#035)_
- [ ] Refine `graph_query` and opinionated graph inspection UX for agent workflows _(#036)_

### Recommended order
1. _#035_ trust / freshness transparency
2. _#033_ trace usefulness
3. _#034_ higher-value agent reasoning
4. _#036_ graph inspection UX

### Exit criteria
- Agents can tell what graph data is live, stale, inferred, or runtime-backed
- `trace` is more useful and less easy to over-trust
- The tool materially reduces search cost and uncertainty in planning, review, and test targeting
- Graph inspection favors agent workflows over query-language completeness for its own sake

---

## Future

- Multi-language support: Python, Go, Rust
- MCP adapter for use outside pi
- Optional semantic search layer
- Live mode / file watching
- Cross-repo or monorepo graph support
- Dev-only graph visualization/debugging tools

---

## Principles

Throughout all milestones:

1. **Structured output first.** Results should stay agent-actionable.
2. **Provenance on every edge.** Trust must be inspectable.
3. **Freshness matters as much as coverage.** Cached graph state must not silently mislead.
4. **Incremental by default.** Recompute only what changed.
5. **TypeScript first.** Keep one language excellent before expanding.
6. **The agent is a collaborator.** Unresolved or agent-authored knowledge should remain explicit, reviewable, and evidence-backed.
