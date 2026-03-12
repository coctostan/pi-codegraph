## Goal

Make `trace` more trustworthy for coding agents by making its trust level explicit in both the returned header and the tool description, so agents can distinguish runtime-backed paths from structural heuristics without changing the existing step-oriented output shape.

## Acceptance Criteria

1. When `trace` returns a runtime-backed path, the first output line starts with `mode: coverage`.
2. When `trace` returns a static fallback path, the first output line starts with `mode: static` and includes explicit heuristic wording indicating there is no runtime evidence.
3. The trust signal for a trace is carried in a structured first-line mode label beginning with `mode:` and does not require any additional prose warning line.
4. When the returned trace is stale, the first output line includes a staleness indicator in addition to the mode label.
5. The tool description states that `trace` returns one deterministic anchored execution path for a test, symbol, or endpoint.
6. The tool description states that trace results may be runtime-backed or heuristic.
7. The tool description explains when an agent should prefer `trace` versus `symbol_graph` or `impact`.
8. Trace step lines remain backward compatible with the current hashline-anchored step format; this issue does not add per-step provenance annotations or free-form explanatory lines to the result body.

## Out of Scope

- Including the covering test name in the trace header.
- Including step count or path depth in the trace header.
- Adding per-step provenance annotations such as `[covered]` or `[static heuristic]`.
- Broadening endpoint tracing to cover middleware chains, multiple handlers, or richer endpoint→handler→callee capture.
- Adding confidence scores per trace or per step.
- Returning multiple candidate traces or alternative path rankings.

## Open Questions

None.

## Requirement Traceability

- `R1 -> AC 1, AC 2`
- `R2 -> AC 4`
- `R3 -> AC 5, AC 6, AC 7`
- `R4 -> AC 3`
- `R5 -> AC 2`
- `O1 -> Out of Scope`
- `O2 -> Out of Scope`
- `D1 -> Out of Scope`
- `D2 -> Out of Scope`
- `D3 -> Out of Scope`
- `D4 -> Out of Scope`
- `C1 -> AC 3, AC 8`
- `C2 -> AC 3`
- `C3 -> AC 8`
- `C4 -> AC 5, AC 6, AC 7`
