# Brainstorm — Issue #075: Trust header opt-out flag

## Goal
Reduce repeated Trust-header noise in multi-call sessions by giving callers an explicit opt-out flag. On non-fresh graphs (`stale` / `mixed` / `heuristic` / `runtime-backed`) the Trust header is ~80 tokens of unchanging preamble that prepends every tool call; after the first read, agents should be able to suppress it on subsequent calls.

## Mode
`Direct requirements`. The user has already specified the mechanism (boolean param per tool), the defaults, and acceptance criteria; the work is clarifying scope (how many tools, how it composes with shipped ceremony) rather than ideation.

## Must-Have Requirements
- **R1** Add an optional boolean parameter `suppressTrustHeader` (default `false`) to the params of every registered read-only tool: `symbol_graph`, `impact`, `trace`.
- **R2** When `suppressTrustHeader === true`, the tool output MUST NOT contain the `## Trust` header block, regardless of trust status (`fresh`, `stale`, `mixed`, `heuristic`, or `runtime-backed`).
- **R3** When `suppressTrustHeader` is absent or `false`, output is byte-identical to today's behavior (fresh still auto-suppressed via `suppressFreshTrustHeader`; non-fresh still renders the full header).
- **R4** The flag is exposed in the pi tool schema / JSON schema for each of the three tools so callers can discover and pass it.
- **R5** Non-trust output (edges, anchors, provenance labels, signal badges, `indexing-failed` notes, dev-gated `_meta` footer) is unaffected by the flag.

## Optional / Nice-to-Have
- **O1** Centralize suppression in `finalizeReadOnlyOutput` (src/index.ts) rather than per-tool, so the three tools thread the flag but only one place strips the header.
- **O2** Short CHANGELOG note pointing at the param as a token-saving affordance for multi-call sessions.

## Explicitly Deferred
- **D1** Session-scoped auto-suppression (sidecar file / process-session token that remembers whether a header was already emitted). Rejected as scope creep; can be revisited if telemetry shows agents don't use the explicit flag.
- **D2** A more granular "trust visibility" enum (e.g. `trust: "auto" | "always" | "never"`). Boolean is sufficient for current need.
- **D3** Extending the flag to non-existent legacy tools (`symbol_card`, `symbol_contract`, `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview`, `dead_code`) — these were removed in M10 Phases 4/5 and the issue's tool list is stale.

## Constraints
- **C1** The issue description lists 5 tools, but the current registered read-only surface is 3 (`symbol_graph`, `impact`, `trace`). Implementation follows the code, not the stale list.
- **C2** Must compose cleanly with the existing `suppressFreshTrustHeader` (src/output/read-only-ceremony.ts) shipped in #064 — the new flag is an additional suppression path, not a replacement.
- **C3** Default behavior must remain unchanged; no existing test snapshot should need updating except tests specifically asserting the new flag.
- **C4** Write-capable / dev-mode tools, if any exist now or later, are out of scope — this is a read-only-output concern.
- **C5** The flag is caller-opt-in only; the extension does not track or infer "first call vs subsequent call."

## Open Questions
- **Q1** Parameter name: `suppressTrustHeader` (as proposed in the issue) vs a shorter alternative (e.g. `trustHeader: false`, `verbose: false`). Default answer: keep `suppressTrustHeader` — explicit, self-documenting, and matches the issue text.

## Recommended Direction
Thread `suppressTrustHeader?: boolean` through the three read-only tool param schemas (`SymbolGraphParams`, `ImpactParams`, `TraceParams` in `src/index.ts`) and pass it into `finalizeReadOnlyOutput`. Inside that helper, after `suppressFreshTrustHeader` runs, apply a second strip step that removes the full `## Trust` block (the first three lines plus its trailing blank separator) when the flag is true. This keeps all suppression logic in one place and avoids per-tool plumbing noise.

Implementation is small: one new helper in `src/output/read-only-ceremony.ts` (e.g. `stripTrustHeader(text)` that handles both `status: fresh` and non-fresh shapes), schema addition in three places, one extra argument to `finalizeReadOnlyOutput`. Existing `suppressFreshTrustHeader` stays as-is to preserve default behavior when the flag is off.

Deferring session-scoped auto-suppression is deliberate: the extension has no reliable process-session notion today (each pi tool call is its own invocation against the shared SQLite store), so implementing it would require a sidecar file with TTL — more complexity than the token savings justify. If post-ship telemetry shows agents never set the flag, we revisit with real data.

## Testing Implications
- Unit test: `stripTrustHeader` (or equivalent) removes a non-fresh Trust block and leaves body untouched; idempotent when header is already absent.
- Integration test per tool (`symbol_graph`, `impact`, `trace`): calling with `suppressTrustHeader: true` produces output with no `## Trust` line, for both fresh and non-fresh graph states.
- Regression test: calling each tool without the flag (or with `false`) yields byte-identical output to the pre-change baseline on both fresh and non-fresh graphs.
- Schema test: the three tool schemas expose `suppressTrustHeader` as an optional boolean.
- Interaction test: flag does not affect `indexing-failed` notes, `_meta: tokens_saved` (when `CODEGRAPH_DEVMETA=1`), or anchor/provenance body content.
