# pi-codegraph — Roadmap

## Status

Core v1 through M10 is complete (M0–M10):
- M0 Foundation
- M1 `symbol_graph` + `resolve_edge` (removed in M10)
- M2 LSP integration
- M3 `impact` + framework rules
- M4 `trace` + coverage
- M5 `graph_query` (removed in M10) + git co-change + hardening
- M6 Functionality hardening and correctness
- M7 Agent utility and product refinement
- M8 Contracts and symbol cards
- M9 Agent ergonomics (overview, dead code, token tracking, BM25 search, inline source)
- M10 Public-surface refocus: the public surface is three read-only tools, `symbol_graph`, `impact` and `trace` ([decision 0001](space/decisions/0001-three-tool-public-surface.md))

Each milestone section below records what it shipped at the time; a tool marked _removed in M10_ is no longer registered. After M10 the roadmap is the **Future** list (multi-language, MCP, semantic search, etc.).
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
- [x] `resolve_edge` tool _(#008 via batch #022)_ — _removed in M10_
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

- [x] `graph_query` tool _(#016 via batch #026)_ — _removed in M10_
- [x] git co-change analysis _(#017 via batch #027)_
- [x] hardening and edge-case coverage _(#018 via batch #027)_
- [x] CI hardening for sg empty-stdout behavior _(#028)_

**Exit criteria met:** All five core tools exist and are tested across the implemented indexing layers.

---

## M6: Functionality hardening and correctness — ✅ COMPLETE

**Goal:** Fix the concrete live-session problems uncovered by real tool-call testing.

- [x] Auto-refresh stale persisted graph on tool invocation _(#029)_
- [x] Make ambiguous symbol handling consistent across `symbol_graph`, `trace`, and `impact` _(#030)_
- [x] Improve `graph_query` support/ergonomics for basic equality `WHERE` predicates _(#031)_
- [x] Deliver as batch _(#032)_

**Exit criteria met:** Tools refresh stale graph state, ambiguity is handled consistently, and basic graph queries work as expected.

---

## M7: Agent utility and product refinement — ✅ COMPLETE

**Goal:** Improve actual value to coding agents beyond simple structural completeness.

- [x] Strengthen `trace` as an agent-oriented path tool with clearer semantics and richer backing data _(#033)_
- [x] Add higher-value agent reasoning affordances beyond structural graph edges _(#034)_
- [x] Improve graph trust, freshness transparency, and persisted-session ergonomics _(#035)_
- [x] Refine `graph_query` and opinionated graph inspection UX for agent workflows _(#036)_
- [x] Tool input validation gaps _(#037)_
- [x] Readonly database resilience _(#038)_
- [x] symbol_graph dedup _(#039)_
- [x] symbol_graph all edge kinds _(#040)_
- [x] trace branching _(#041)_
- [x] impact not-found diagnostics _(#042, #047)_
- [x] impact addition explanation _(#043)_
- [x] delete_edge tool _(#044)_ — _removed in M10_
- [x] graph_query error messages _(#045)_
- [x] Tool output quality batch _(#046)_

**Exit criteria met:** Trust and freshness are transparent, trace communicates confidence, tools reduce search cost for planning/review/test targeting, and all live-session bugs are fixed.

---

## M8: Contracts and symbol cards — ✅ COMPLETE

**Goal:** Turn codegraph from a dependency browser into a verification input. Extract type signatures, expose compact symbol cards, and mine behavioral contracts from types and test assertions.

### Scope
- [x] Type signature extraction from tree-sitter AST _(#048)_
- [x] `symbol_card` tool: compact symbol summary _(#049)_ — _folded into `symbol_graph` in M10_
- [x] `symbol_contract` tool: behavioral evidence from types and tests _(#050)_ — _folded into `symbol_graph`'s `include: ["contract"]` in M10_
- [x] Deliver as batch _(#051)_

### Build order
1. _#048_ type signature extraction (data layer)
2. _#049_ symbol_card (assembly of existing data + signatures)
3. _#050_ symbol_contract (new extraction: error paths, test assertion mining)
### Why this milestone exists
The graph currently answers "where should I look?" but not "what does this symbol promise?" Contracts and cards give agents verification-grade intelligence — what a function takes, returns, throws, and what tests assert about it — in one call instead of grep chains.

### Exit criteria
- A symbol can answer: what it takes in, what it returns, what tests cover it, what invariants seem to hold, what nearby symbols matter most
- `symbol_card` returns a compact fact sheet with definition, signature, tests, and key relationships
- `symbol_contract` returns input/output types, error paths, and test-evidenced behaviors
- Type signatures are extracted and persisted for functions, classes, and interfaces

**Exit criteria met:** Symbol cards and contracts return compact, anchored summaries with type signatures, test coverage, error paths, and behavioral evidence. All 334 tests pass.
---

## M9: Agent ergonomics — ✅ COMPLETE

**Goal:** Quick-win ergonomics improvements that query existing graph data in new ways. Inspired by jCodeMunch tool analysis.

- [x] Graph overview / onboarding discovery tool _(#053)_ — _removed in M10_
- [x] Dead code detection: find unreferenced symbols _(#054)_ — _removed in M10_
- [x] Token savings tracking in tool response metadata _(#055)_
- [x] BM25 ranked symbol search _(#056)_
- [x] Inline source snippets in `symbol_card` output _(#057)_
- [x] Deliver first three as batch _(#058)_

**Exit criteria met:** Agents have an onboarding entry point, can answer "is this symbol used?", and see token-savings telemetry plus ranked symbol search and inline source snippets.

---

## M10: Public-surface refocus — ✅ COMPLETE

**Goal:** Cut the 11-tool model-facing surface to ~3, strip per-call output ceremony, and normalize tool descriptions. The graph, store, and schema stay unchanged — only the tool layer on top changes.

**Why:** codegraph is technically strong but under-used. The failure mode is "agent doesn't pick any codegraph tool" (falls back to grep/read), not "agent picks the wrong one." Too many overlapping tools, unconditional Trust/`_meta` ceremony on every call, and inconsistent descriptions all suppress pick-rate.

### Phases

- [x] **Phase 1 — Output ceremony cleanup** _(#059 via batch #064, PR #39)_: Trust header only on non-fresh results; `_meta: tokens_saved` footer gated behind `CODEGRAPH_DEVMETA`.
- [x] **Phase 2 — Description normalization** _(#060 via batch #064, PR #39)_: style guide in `docs/tool-descriptions.md`, rewritten descriptions, README aligned with the registered tools.
- [x] **Phase 3 — Demote dev-mode tools** _(#061, PR #40)_: `graph_query`, `graph_overview`, `dead_code` moved behind `CODEGRAPH_DEVMODE`; `symbol_search` made internal.
- [x] **Phase 4 — Unify symbol-lookup family** _(#062, PR #41)_: `symbol_graph` gained `include?: Array<"neighborhood" | "contract" | "source">`; `symbol_card` and `symbol_contract` removed as standalone tools.
- [x] **Phase 5 — Dead-code cut** _(#063, PR #46)_: `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview` and `dead_code` deleted after zero calls in the 2026-04-17 → 2026-04-19 window (`test/phase5-decision-matrix.ts`), with no deprecation shim.

### Outcome

- Public tool count: 11 → 3 (`symbol_graph`, `impact`, `trace`), with no dev-mode tools left ([decision 0001](space/decisions/0001-three-tool-public-surface.md)).
- Per-call ceremony: fresh results carry no Trust header and no `_meta` footer; no before/after token count is recorded here.
- Tool-picking rate: not recorded here.
- "`graph_query` still works behind a flag": superseded — Phase 5 deleted it after zero dev-mode calls.
- README and code agree on what tools exist, guarded by the docs tests under `test/`.

**Reference:** `~/pi/workspace/thinkingspace/plans/codegraph-refocus-plan.md`.

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
