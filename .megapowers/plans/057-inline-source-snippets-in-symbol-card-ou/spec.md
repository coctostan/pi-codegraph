# Spec: Inline source snippets in symbol_card output

## Goal

Add inline source snippets to `symbol_card` output so agents get the target symbol's full definition and neighbor signatures in a single tool call, eliminating follow-up `read()` round-trips. A `maxSourceLines` parameter caps output size.

## Acceptance Criteria

1. `symbol_card` output includes a `### Source` section containing the target symbol's source code read from disk using `start_line`/`end_line`, placed after the header/anchor and before Signature.
2. Source lines are rendered in hashline anchor format (`LINE:HASH|content`) matching pi's `read` tool format, usable directly with `edit`.
3. When `maxSourceLines` is provided, source is truncated to that many lines with a `(N more lines truncated)` indicator appended.
4. When `maxSourceLines` is omitted, a default of 50 lines is used.
5. When the source file doesn't exist on disk, the Source section shows `source unavailable` instead of a code block.
6. When `end_line` is null on the node, the Source section shows `source unavailable`.
7. When the file's content hash mismatches the node's `content_hash`, the Source section header includes a `[stale]` marker.
8. The Key Relationships section includes the `signature` field (from `GraphNode.signature`) for each listed neighbor, displayed on a second line under the neighbor name.
9. Neighbor signature display is limited to the existing top-5-per-group cap and shows signature only (no source body).
10. Neighbors without a stored signature show no signature line (no "not available" noise).
11. Existing `symbol_card` sections (header, anchor, Signature, Exported, Covering Tests, Key Relationships, Signals) remain present and structurally unchanged apart from the additions in AC 8–10.
12. `SymbolCardParams` interface in `symbol-card.ts` accepts an optional `maxSourceLines` number field.
13. The Typebox schema for `symbol_card` in `index.ts` includes an optional `maxSourceLines` number parameter with description.
14. A `readSourceSnippet` utility function is extracted (new file or in existing output module) that takes a `GraphNode`, `projectRoot`, and optional line limit, returning hashlined source string or null.

## Out of Scope

- **Token-counting budget** (D1) — line-based truncation only; token-aware budgets deferred.
- **Source inlining for `symbol_contract`** (D2) — this issue covers `symbol_card` only.
- **Cross-call file content caching** (D3) — each call reads independently.
- **`include_source` toggle parameter** (O1) — source is always included; omit parameter for simplicity. Can be added later if agents need metadata-only mode.
- **Test definition source snippets** (O2) — covering tests remain anchor-only.

## Open Questions

None.

## Requirement Traceability

- `R1` → AC 1, AC 14
- `R2` → AC 8, AC 9, AC 10
- `R3` → AC 3, AC 4, AC 12, AC 13
- `R4` → AC 5, AC 6
- `R5` → AC 2
- `R6` → AC 11
- `R7` → AC 8, AC 9, AC 10
- `O1` → Out of Scope
- `O2` → Out of Scope
- `D1` → Out of Scope
- `D2` → Out of Scope
- `D3` → Out of Scope
- `C1` → AC 14 (uses `node:fs`, no new deps)
- `C2` → AC 2, AC 11 (structured text output)
- `C3` → AC 12, AC 13
- `C4` → AC 7
