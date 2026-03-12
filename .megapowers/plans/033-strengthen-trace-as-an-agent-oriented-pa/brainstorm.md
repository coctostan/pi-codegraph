# Brainstorm: Strengthen trace as an agent-oriented path tool

## Goal

The `trace` tool works but doesn't help agents calibrate trust in its output. Static fallback traces look as authoritative as coverage-backed traces. The mode header is terse and the tool description is generic. The outcome is that agents can clearly distinguish high-confidence runtime-backed traces from structural heuristics and make informed decisions about whether to trust the output or read the source directly.

## Mode

`Direct requirements` — the problems are concrete (static traces look too authoritative, tool description is vague), the current implementation is well-understood, and the solution direction is clear (better labeling, richer mode semantics, improved tool description).

## Must-Have Requirements

- **R1:** The trace header mode label must clearly distinguish coverage-backed traces from static heuristic traces. Coverage: `mode: coverage`. Static: `mode: static (heuristic, no runtime evidence)` or equivalent unambiguous phrasing.
- **R2:** When the entire trace is stale (content hash mismatches), the mode label must include a staleness indicator (e.g., `[stale]`) in addition to the mode type.
- **R3:** The tool description (what the agent sees in its tool list) must explain: what trace returns, that results may be coverage-backed or heuristic, when to use `trace` vs `symbol_graph` or `impact`, and that a single deterministic path is returned.
- **R4:** The mode label must be machine-parseable — a structured prefix the agent can key off of (not free-form prose).
- **R5:** Static mode output must not look identical in authority to coverage mode output. The mode label difference is the minimum required signal.

## Optional / Nice-to-Have

- **O1:** Include the name of the covering test in coverage-mode trace headers (e.g., `mode: coverage (via testProcessOrder)`), giving the agent a direct pointer to the test backing the trace.
- **O2:** Include step count or depth in the header as a quick sizing signal (e.g., `steps: 5`).

## Explicitly Deferred

- **D1:** Per-step provenance annotations (e.g., `[covered]` / `[static heuristic]` per step). Discussed and deferred — add later if mixed traces prove common enough to warrant it.
- **D2:** Broader endpoint→handler→callee capture (middleware chains, multiple handlers). This is a new indexing feature, not a trust/labeling improvement.
- **D3:** Confidence scores per step or per trace.
- **D4:** Multiple candidate trace ranking or alternative path display.

## Constraints

- **C1:** Output must remain compact and structured — no prose warnings or emoji. Agent-optimized, not human-optimized.
- **C2:** The header line is the trust signal carrier. No separate warning lines.
- **C3:** Existing trace output format (hashline-anchored steps) must remain backward compatible — changes are additive to the header, not destructive to step format.
- **C4:** Tool description must fit the pi extension tool description format — concise but complete.

## Open Questions

None.

## Recommended Direction

The core change is small: enrich the mode header label and rewrite the tool description. The mode header goes from a bare `mode: coverage` / `mode: static` to a label that carries explicit trust semantics — `mode: coverage` stays clean (high trust needs no qualification), while `mode: static (heuristic, no runtime evidence)` makes the agent pause before treating the path as fact. Staleness continues to append `[stale]` as it does today.

The tool description rewrite is the higher-leverage change. Today it says "Return one deterministic anchored execution path for a test, symbol, or endpoint" — this tells the agent nothing about trust levels, when to prefer trace over symbol_graph, or what "deterministic" means in practice. The new description should explain that coverage-backed traces reflect actual test execution while static traces are structural heuristics, and position trace as a "follow one path deep" complement to symbol_graph's "see the neighborhood."

Both changes are small in implementation surface — the mode header is formatted in the output layer, and the tool description is in the extension wiring. The testing is straightforward: existing tests verify format, new tests verify the enriched labels.

## Testing Implications

- Test that coverage-backed traces emit the expected mode label format
- Test that static fallback traces emit the distinct heuristic-indicating label format
- Test that stale traces append the staleness indicator to the enriched label
- Test that the tool description string contains key phrases (coverage-backed, heuristic, when to use)
- Existing trace tests (static fallback, endpoint, stale, ambiguous) must continue passing with the new header format
