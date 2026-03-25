# Brainstorm: Inline source snippets in symbol_card output

## Goal

`symbol_card` currently returns anchors (file:line:hash) but no actual source code — the agent must then `read()` each file separately. This feature inlines the target symbol's full definition source and signature-only snippets for top neighbors directly into the `symbol_card` output, turning it from "here's where to look" into "here's what you need" in a single tool call. A token budget parameter caps output size to prevent blowup on large symbols.

## Mode

Direct requirements — the desired behavior is already concrete. The issue specifies what to inline (symbol definition + key neighbors), and the scoping question (full body vs signature-only for neighbors) is resolved.

## Must-Have Requirements

- **R1:** `symbol_card` output includes the target symbol's full source definition, read from disk using `start_line`/`end_line`, rendered as a hashlined code block.
- **R2:** `symbol_card` output includes signature-only snippets for top neighbors (callers and callees, ranked by confidence), not full bodies.
- **R3:** A `maxSourceLines` parameter (optional, with sensible default) controls how many lines of the target symbol's source are included. If the symbol exceeds this, the source is truncated with a clear indicator.
- **R4:** When a symbol's source file doesn't exist on disk, or `end_line` is null, the source section is omitted gracefully (no crash, no empty block — just a note like "source unavailable").
- **R5:** Source snippets use the same hashline anchor format (`LINE:HASH|content`) used by pi's `read` tool, so agents can use anchors from the output directly with `edit`.
- **R6:** The existing `symbol_card` sections (header, signature, exported, tests, relationships, signals) remain unchanged — source is additive.
- **R7:** Neighbor source snippets are limited to the top N neighbors (matching the existing cap of 5 per relationship group) and show only the signature line, not full bodies.

## Optional / Nice-to-Have

- **O1:** A `include_source` boolean parameter to disable source inlining entirely (for cases where the agent only wants metadata).
- **O2:** Include source snippets for covering test definitions (not just test anchors).

## Explicitly Deferred

- **D1:** Token-counting budget (counting actual tokens rather than lines) — use line-based truncation for now; token-aware budgets can come later.
- **D2:** Inlining source for `symbol_contract` output.
- **D3:** Caching read file contents across multiple symbol_card calls in the same session.

## Constraints

- **C1:** Must not add new runtime dependencies — file reading uses `node:fs` (already used in `symbol_contract` and `anchoring.ts`).
- **C2:** Output must remain structured text, not JSON — consistent with all other tool outputs.
- **C3:** The tool parameter schema change (`maxSourceLines`) must be reflected in both the `SymbolCardParams` interface in `symbol-card.ts` and the Typebox schema in `index.ts`.
- **C4:** Stale files (content hash mismatch) should still show source but with a `[stale]` marker on the source block.

## Open Questions

None.

## Recommended Direction

Add a `### Source` section to `symbol_card` output immediately after the header/anchor. Read the target symbol's file from disk using `readFileSync` (pattern already established in `symbol_contract` and `computeAnchor`). Extract lines from `start_line` to `end_line`, compute per-line hashes using the same `sha256Hex` approach from `anchoring.ts`, and render as hashlined content. Truncate at `maxSourceLines` (default ~50) with a `(N more lines truncated)` indicator.

For neighbor snippets, add a one-line signature under each neighbor in the Key Relationships section. The signature is already stored on `GraphNode.signature` — no disk read needed. This keeps neighbor sections compact while giving the agent enough context to decide whether to `read()` the full neighbor.

The source-reading logic should be extracted into a small utility (e.g., `readSourceSnippet` in `output/anchoring.ts` or a new `output/source.ts`) since both the target symbol extraction and any future tools will need it. This utility takes a `GraphNode` and `projectRoot`, returns hashlined source or null.

## Testing Implications

- Test that `symbol_card` output includes a `### Source` section with correct hashline-anchored content for a known symbol.
- Test truncation: a symbol with more lines than `maxSourceLines` shows truncated output with indicator.
- Test graceful degradation: missing file → no source section; null `end_line` → no source section.
- Test stale marker: when content hash mismatches, source block shows `[stale]`.
- Test neighbor signatures appear in relationship sections.
- Test that existing sections (signature, exported, tests, relationships, signals) are unchanged.
- Test `maxSourceLines` parameter override works.
