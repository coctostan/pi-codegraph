---
id: 73
type: bugfix
status: done
created: 2026-04-20T10:32:55.991Z
priority: 1
---
# impact: silent empty output for entry-points and isolated symbols
## Problem

`impact` returns completely empty output (no text, no newline) when the target symbol has no inbound `calls` edges. This happens for:

1. **Entry points** — symbols with no callers (e.g. `indexProject`, `piCodegraph`)
2. **Interfaces** — traversal only follows `calls` edges, so `GraphStore` and any interface returns nothing
3. **Leaf utilities** with no callers

An agent calling `impact(["indexProject"], "signature_change")` receives an empty string and has no idea whether the tool failed, the symbol doesn't exist, or there are genuinely no dependents.

## Expected behaviour

When `collectImpactDetails` returns an empty array, the `impact` function (src/tools/impact.ts:131) should return an explicit, informative message. The message should differentiate:

- **Entry point** (`fan-in === 0`): `"No dependents found — 'indexProject' is an entry point with no callers."`
- **Interface/type-only node**: `"No call-edge dependents found for interface 'GraphStore'. Consider checking implementors via symbol_graph."`
- **Genuinely isolated**: `"No dependents found for 'X' within depth N."`

## Location

- `src/tools/impact.ts` — `impact()` function, after the `hits.length === 0` guard (around line 158)
- The guard currently returns early with no output; replace that bare `return ""` (or equivalent) with a diagnostic message
- `collectImpactDetails` at line 66 already returns `[]` for `addition` — model the empty-result message after that pattern

## Acceptance criteria

- `impact(["indexProject"], "signature_change")` → non-empty string with explanation
- `impact(["GraphStore"], "removal")` → non-empty string distinguishing the interface case
- `impact(["sha256Hex"], "removal")` with file-disambiguated sha256Hex → non-empty string
- Existing tests for non-empty impact results continue to pass
