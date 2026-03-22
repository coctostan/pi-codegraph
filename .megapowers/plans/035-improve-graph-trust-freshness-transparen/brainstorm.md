## Goal
Make persisted graph state legible and trustworthy to an agent by surfacing a compact, consistent trust/freshness summary on read-oriented tool outputs, while preserving row-level markers for local exceptions such as stale, heuristic, unresolved, or agent-authored results.

## Mode
`Exploratory`

The broad problem was known, but the implementation slice was not. The discussion narrowed scope from general “trust/freshness transparency” into a specific agent-oriented output contract.

## Must-Have Requirements
1. **R1** Each read-oriented tool (`symbol_graph`, `trace`, `impact`, `graph_query`) must prepend a compact always-on trust/freshness header to its output.
2. **R2** The trust/freshness header must use consistent vocabulary and semantics across those tools.
3. **R3** The trust/freshness header must help an agent answer whether the result is fresh, stale, inferred, heuristic, runtime-backed, or mixed.
4. **R4** Line-level annotations must remain available for local exceptions or row-specific conditions rather than repeating the full trust state on every line.
5. **R5** `trace` must preserve explicit mode semantics that distinguish runtime-backed coverage paths from static heuristic paths.
6. **R6** The issue must focus on output semantics and transparency rather than adding new indexing stages, watchers, or refresh workflows.
7. **R7** The design must make persisted state feel trustworthy in multi-session use without requiring the agent to infer trust status from scattered markers.
8. **R8** The trust/freshness solution must be optimized for agent readability and token efficiency rather than human-oriented prose.

## Optional / Nice-to-Have
1. **O1** Surface compact graph/session metadata in the header, such as stale file count, evidence mix, or similar summary fields.
2. **O2** Surface indexed-at or recency metadata if it can be presented compactly and consistently.
3. **O3** Add targeted freshness/trust confirmation to `resolve_edge` output without applying the full generic trust header there.

## Explicitly Deferred
1. **D1** New indexing stages or trust mechanisms beyond the current architecture.
2. **D2** File watching, live mode, or new refresh workflows.
3. **D3** A full lifecycle/review system for agent-authored edges.
4. **D4** Applying the same generic trust header to `resolve_edge` in this slice.

## Constraints
1. **C1** The solution must build on existing architecture and signals where possible, including current stale detection, provenance, and trace mode semantics.
2. **C2** Existing correctness behavior from `#029` must remain intact; this issue is not a replacement for auto-refresh on tool invocation.
3. **C3** Output must remain structured and agent-actionable.
4. **C4** The trust/freshness layer must avoid excessive token overhead.
5. **C5** Consistency across `symbol_graph`, `trace`, `impact`, and `graph_query` is required.
6. **C6** TypeScript-only scope remains unchanged.

## Open Questions
1. **Q1** What exact fields belong in the default trust header versus remaining implicit or line-level only?
2. **Q2** Should indexed-at / recency metadata be always-on in the header or only added when useful/debugging-oriented?

## Recommended Direction
The best slice for this issue is a shared trust-header layer for the read-oriented tools only: `symbol_graph`, `trace`, `impact`, and `graph_query`. Those are the tools an agent uses to form beliefs about the codebase, so they need one stable decision point at the top of the output. `resolve_edge` is different: it is primarily a write operation, so the generic header would add more noise than value there.

The output model should be hybrid. A compact always-on header should state the global trust condition for the result, while line-level markers should remain for local exceptions. That gives the agent a fast answer to “can I trust this result?” without forcing repeated per-line noise. It also preserves precision where rows differ from the overall status.

This issue should stay focused on output semantics rather than system behavior changes. The main correctness gap from stale persisted state was already addressed in `#029`, and the repo already contains partial trust signals such as stale markers, provenance/confidence data, and trace mode labeling. The right move now is to unify and standardize those signals rather than inventing new refresh mechanisms.

If implemented well, this should make persisted graph state a strength rather than a hidden risk. Agents should be able to tell, quickly and consistently, when they are looking at current data, mixed/inferred data, heuristic output, or locally stale exceptions, without needing extra tool calls or ad hoc reasoning.

## Testing Implications
- Verify that `symbol_graph`, `trace`, `impact`, and `graph_query` all emit a trust/freshness header.
- Verify that the header format and vocabulary are consistent across those tools.
- Verify that line-level markers still appear only where locally meaningful.
- Verify that `trace` still distinguishes runtime-backed coverage output from static heuristic output.
- Verify stale and fresh scenarios for each read-oriented tool.
- Verify that unchanged projects do not regress in output clarity or token discipline.
- Verify that `resolve_edge` does not receive the full generic header in this slice.
