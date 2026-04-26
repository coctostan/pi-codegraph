---
id: 81
type: feature
status: done
created: 2026-04-20T10:32:55.993Z
priority: 3
---
# impact: maxDepth not exposed in tool schema — agents can't control traversal depth
## Problem

`collectImpactDetails` accepts `maxDepth` (default 5) and it works when provided directly. However, the pi tool schema registered in `src/index.ts` for the `impact` tool does not expose `maxDepth` as a parameter. Agents calling `impact` through the tool interface have no way to override the depth.

This matters because:
- Deep codebases with many layers produce very long output at depth 5
- Agents doing quick triage want depth 1-2 only
- Agents doing full blast-radius analysis want depth 7-10

## Fix

1. In `src/index.ts`, find the `impact` tool registration and add `maxDepth` to its JSON Schema input definition (integer, minimum 1, maximum 10, default 5)
2. Ensure the `maxDepth` value from the tool call params is passed through to `collectImpactDetails`
3. Add a brief description: `"Maximum traversal depth for dependency graph (default: 5)"`

## Location

- `src/index.ts` — tool registration block for `impact` (search for `"impact"` in the pi.tool() calls around line 184)
- `src/tools/impact.ts` — `impact()` function params type already includes `maxDepth?: number` — no change needed there

## Acceptance criteria

- Agent can call `impact({ symbols: ["X"], changeType: "behavior_change", maxDepth: 2 })` via the tool interface
- `maxDepth: 1` returns only direct callers
- Default behaviour (no `maxDepth` specified) remains depth 5
- Tool schema for `impact` includes `maxDepth` with correct JSON Schema definition
