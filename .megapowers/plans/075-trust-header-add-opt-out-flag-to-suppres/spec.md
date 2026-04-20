# Spec — Issue #075: Trust header opt-out flag

## Goal
Add an optional, caller-controlled boolean parameter to the three registered read-only codegraph tools (`symbol_graph`, `impact`, `trace`) that, when set, suppresses the `## Trust` header block from tool output. This lets agents avoid paying the ~80-token header cost on follow-up calls in multi-call sessions against non-fresh graphs, without breaking any existing behavior when the flag is absent.

## Acceptance Criteria

1. Each of the three read-only tool parameter schemas in `src/index.ts` (`SymbolGraphParams`, `ImpactParams`, `TraceParams`) includes an optional boolean field named `suppressTrustHeader` with a human-readable description indicating it skips the Trust header.

2. The pi tool schema exposed to callers for `symbol_graph`, `impact`, and `trace` advertises `suppressTrustHeader` as an optional boolean parameter, so callers can discover it from the JSON schema.

3. Calling `symbol_graph` with `suppressTrustHeader: true` against a non-fresh graph (status `stale`, `mixed`, `heuristic`, or `runtime-backed`) returns output whose first non-empty line is not `## Trust`, and contains no `## Trust` header block.

4. Calling `impact` with `suppressTrustHeader: true` against a non-fresh graph returns output with no `## Trust` header block.

5. Calling `trace` with `suppressTrustHeader: true` against a non-fresh graph returns output with no `## Trust` header block.

6. Calling any of the three tools with `suppressTrustHeader: true` against a fresh graph returns output with no `## Trust` header block (same visible result as the current fresh-suppression path — idempotent with `suppressFreshTrustHeader`).

7. Calling any of the three tools with `suppressTrustHeader` absent, `undefined`, or `false` produces output byte-identical to the pre-change baseline for both fresh graphs (header already suppressed by `suppressFreshTrustHeader`) and non-fresh graphs (full Trust header still rendered).

8. A single helper in `src/output/read-only-ceremony.ts` (name tentatively `stripTrustHeader`) removes a complete `## Trust` header block — defined as a contiguous run of lines starting with `## Trust`, `status: <value>`, and `evidence: ...  stale-files: ...` — from the head of a string, and returns its input unchanged when the head does not match that shape.

9. `stripTrustHeader` is idempotent: calling it on text that has no Trust header returns the input unchanged, and calling it twice yields the same result as calling it once.

10. All trust-header suppression happens inside `finalizeReadOnlyOutput` (src/index.ts); individual tool functions (`symbolGraph`, `impact`, `trace` in `src/tools/`) do not read the new flag directly.

11. The `suppressTrustHeader` flag does not affect `_meta: tokens_saved` output when `CODEGRAPH_DEVMETA=1` is set — the dev-gated meta footer is still appended identically.

12. The `suppressTrustHeader` flag does not affect the `indexing-failed (<N>s ago): ...` note emitted by `finalizeReadOnlyOutput` when `lastIndexError` is set — the note still prepends tool output.

13. The `suppressTrustHeader` flag does not alter anchors, edge provenance labels (e.g. `[source: lsp]`), signal badges (e.g. `[hub]`, `[tested]`), or any non-Trust body content.

14. Default behavior of `suppressFreshTrustHeader` (src/output/read-only-ceremony.ts) is unchanged: it continues to strip the Trust header only when `status: fresh`, and is still invoked unconditionally in `finalizeReadOnlyOutput`.

## Out of Scope

- Session-scoped auto-suppression of the Trust header (e.g. sidecar file, process-session token, TTL-based suppression). Explicitly deferred (D1).
- Granular trust-visibility enum such as `trust: "auto" | "always" | "never"`. Explicitly deferred (D2).
- Adding the flag to removed/legacy tools (`symbol_card`, `symbol_contract`, `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview`, `dead_code`). These are no longer registered; the issue's 5-tool list is stale (D3, C1).
- Write-capable or dev-mode-only tools beyond the three currently registered read-only tools (C4).
- Changes to the contents or wording of the Trust header itself.
- Parameter-name changes (e.g. renaming `suppressTrustHeader` to `verbose` or `trustHeader`). Name is fixed per Q1 resolution.
- CHANGELOG note (O2) — nice-to-have polish, not a contract requirement; may be added by implementer but not verified as an AC.

## Open Questions

None.

## Requirement Traceability

- `R1` -> AC 1
- `R2` -> AC 3, AC 4, AC 5, AC 6
- `R3` -> AC 7, AC 14
- `R4` -> AC 2
- `R5` -> AC 11, AC 12, AC 13
- `O1` -> AC 10
- `O2` -> Out of Scope (optional polish, not a contract requirement)
- `D1` -> Out of Scope
- `D2` -> Out of Scope
- `D3` -> Out of Scope
- `C1` -> Out of Scope (3-tool scope encoded in AC 1, AC 3–5)
- `C2` -> AC 6, AC 14
- `C3` -> AC 7
- `C4` -> Out of Scope
- `C5` -> AC 7 (no inference — only the explicit flag controls suppression)
- `Q1` -> Resolved: name is `suppressTrustHeader` (rename Out of Scope)
