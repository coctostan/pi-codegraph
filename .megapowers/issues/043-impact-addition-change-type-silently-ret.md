---
id: 43
type: bugfix
status: open
created: 2026-03-23T12:35:57.252Z
priority: 3
---
# impact: addition change type silently returns empty instead of explaining the limitation

## Observed behavior

`impact(["indexProject"], "addition")` returns just a trust header with empty body:
```
## Trust
status: fresh
evidence: agent,git,lsp,tree-sitter  stale-files: 0/136
```

No indication that addition analysis is unsupported. Agent might conclude "zero impact" and miss consequences.

## Root cause

Two locations:
- `src/tools/impact.ts:68` — `collectImpactDetails`: `if (changeType === "addition") return [];`
- `src/tools/impact.ts:36-37` — `classify`: `if (changeType === "addition") return null;`

Both silently return empty. The `impact()` rendering function at line 160 treats empty results as success: `if (hits.length === 0) return prependTrustHeader("", { stats });`

## Expected behavior

Return an explicit message: `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood` or similar. Alternatively, additions could analyze implementors of extended interfaces.

## Files involved

- `src/tools/impact.ts` — lines 37, 68, 160
