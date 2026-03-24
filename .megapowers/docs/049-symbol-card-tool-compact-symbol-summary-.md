# Feature: `symbol_card` tool — compact symbol summary

## What
New `symbol_card` tool that returns a compact, structured fact sheet for a symbol in one call: definition anchor, type signature, export status, covering tests, key relationships, and signal badges.

## Why
Agents previously needed to combine `symbol_graph` (neighborhood), `trace` (execution path), and `impact` (change analysis) to answer "what is this symbol?" before deciding what to read or change. `symbol_card` provides the 80% answer in a single call with a flat, scannable format.

## How it works
- **Input:** `{ name: string, file?: string }`
- **Not found:** Trust-headered "not found" message
- **Ambiguous:** Disambiguation list with anchors (same as `symbol_graph`)
- **Single match:** Flat markdown card with sections:
  - `## name (kind)` + hashline anchor
  - `### Signature` — from `node.signature` or "not available"
  - `### Exported` — yes/no
  - `### Covering Tests` — from `tested_by` edges with anchors
  - `### Key Relationships` — callers, callees, imports, extends, implements (counts + top names)
  - `### Signals` — role badges via `formatRoleTags`

## Files
- `src/tools/symbol-card.ts` — pure `symbolCard()` function (105 lines)
- `src/index.ts` — tool registration (+21 lines)
- 8 test files covering all paths and edge cases

## Design decisions
- **Flat format, not `symbol_graph` format:** No per-neighbor confidence/provenance detail. Counts + names only.
- **No LSP enrichment at tool time:** Shows whatever edges exist. If `symbol_graph` was called first, those LSP-enriched edges persist.
- **Filters `__meta__`/`__unresolved__` markers:** Matches `symbol_graph` behavior to avoid internal nodes polluting output.
- **Graceful signature fallback:** Works without #048 type extraction — shows "not available" when `node.signature` is null.

## Part of M8
This is issue #049 in the "Contracts and symbol cards" milestone, building on #048 (type signature extraction).
