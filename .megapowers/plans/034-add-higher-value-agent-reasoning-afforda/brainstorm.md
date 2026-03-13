# Brainstorm: Add Higher-Value Agent Reasoning Affordances

## Goal

The current pi-codegraph tools return structural adjacency data — what calls what, what's affected, what path execution follows. Agents can determine "where should I look?" but get limited help with "what matters here?" and "what should I look at first?" This issue adds a shared signal computation layer that classifies nodes with structural roles and risk signals, then surfaces those signals as compact always-on annotations in `impact`, `symbol_graph`, and `trace` output. The intended outcome is that agents make fewer follow-up tool calls and file reads because tool output directly communicates priority and risk.

## Mode

`Exploratory` — the issue started with a broad direction ("higher-value agent reasoning affordances") and required trade-off discussion to narrow to a concrete, feasible scope without LLM dependencies.

## Must-Have Requirements

- **R1**: A shared signal computation module that classifies graph nodes with structural role signals derived from existing graph topology, test coverage, git co-change, and framework rule data.
- **R2**: The following structural role signals must be computable: entry point (exported, zero inbound call edges), hub (high fan-in AND fan-out), leaf (zero outbound call edges), tested (has `tested_by` edges), untested (no `tested_by` edges), framework-mediated (has edges sourced from ast-grep rules).
- **R3**: The following quantitative signals must be computable per node: fan-in count, fan-out count, co-change correlation score (from git co-change edges).
- **R4**: `impact` tool output must rank affected symbols by priority rather than returning a flat list. Ranking must incorporate fan-in count, test coverage presence, and co-change frequency with the changed symbol(s).
- **R5**: `impact` tool output must include a compact "why" annotation on each affected symbol explaining the ranking basis (e.g., `[hub, fan-in:12, untested]`).
- **R6**: `symbol_graph` tool output must include compact inline role tags on each symbol in the neighborhood (e.g., `[entry-point, tested]` or `[leaf]`).
- **R7**: `trace` tool output must annotate each step in the execution path with compact inline signals (e.g., `[hub, untested]`).
- **R8**: Signals must be always-on in tool output — no opt-in parameter required. The format must be compact (inline tags, not separate sections) to minimize token overhead.
- **R9**: Edge chain confidence (weakest-link confidence across the path from changed symbol to affected symbol) must be included in `impact` ranking and annotations.

## Optional / Nice-to-Have

- **O1**: Cohesive multi-signal views that combine neighborhood + risk signals + coverage status in a single call, reducing the need for agents to call `symbol_graph` + `impact` + `trace` separately.
- **O2**: Semantic grouping of related symbols (e.g., all symbols in a module, all symbols sharing a co-change cluster) in `impact` output.

## Explicitly Deferred

- **D1**: LLM-generated natural language summaries of what functions/classes do.
- **D2**: Embedding-based semantic search or similarity.
- **D3**: Pattern classification (singleton, factory, DI, etc.) — would require heuristic rules or LLM.
- **D4**: New standalone tools (e.g., `symbol_profile`) — signals are delivered through existing tool output instead.

## Constraints

- **C1**: No external servers, no LLM calls, no embedding models. All signals must be computed from data already in the graph store (topology, provenance, coverage, git co-change).
- **C2**: No new dependencies beyond what already exists in the project (SQLite, tree-sitter, ast-grep, tsserver).
- **C3**: Signal computation must not noticeably degrade tool response time. Precomputation or caching is acceptable.
- **C4**: Existing tool output format is extended, not replaced. Current consumers must not break.
- **C5**: The signal computation module must be a shared layer consumed by all three tools, not duplicated per tool.

## Open Questions

- **Q1**: What fan-in/fan-out thresholds define "hub"? Should this be configurable or use a heuristic (e.g., top 10% of the distribution)?
- **Q2**: Should `graph_query` results also include signal annotations, or is that out of scope for this issue (since graph_query is raw/power-user)?

## Recommended Direction

Build a `SignalComputer` module in `src/output/` (or `src/signals/`) that takes a node ID and the graph store, and returns a `NodeSignals` object containing: structural role tags, fan-in/fan-out counts, test coverage boolean, co-change score, and any framework-mediation flag. This module queries the graph store directly — it's a read-only computation over existing edges and nodes.

For `impact`, the current flat classification pass gets replaced with a ranked pass. After collecting affected symbols via graph traversal (existing logic), each symbol's `NodeSignals` are computed. A composite score combining fan-in, coverage gap, co-change correlation, and edge-chain confidence determines the output order. The annotations are rendered inline in the existing markdown output format.

For `symbol_graph` and `trace`, the change is lighter — each symbol in the output gets its `NodeSignals` computed and rendered as compact inline tags after the symbol anchor. No structural change to how neighborhoods or paths are built; only the rendering step is enriched.

The key risk is performance: computing signals for every symbol in a large impact result could mean many small queries. Batch queries or a single precomputation pass per tool invocation would mitigate this. The spec phase should define the exact SQL queries and determine whether signals should be precomputed at index time or computed lazily at tool time.

## Testing Implications

- Unit tests for `SignalComputer`: given a graph with known topology, verify correct role classification (hub, leaf, entry-point, tested/untested, framework-mediated)
- Unit tests for fan-in/fan-out counting accuracy
- Unit tests for edge-chain confidence calculation (weakest link)
- Integration tests for `impact` ranking: given a graph with symbols of varying fan-in, coverage, and co-change scores, verify output order matches expected priority
- Integration tests for `symbol_graph` output: verify inline tags appear and are accurate
- Integration tests for `trace` output: verify step annotations appear and are accurate
- Regression tests: verify existing tool output structure is preserved (tags are additive, not replacing)
- Performance test: verify signal computation on a reasonably-sized graph completes within acceptable bounds
