---
id: 30
type: bugfix
status: done
created: 2026-03-11T14:15:39.154Z
priority: 2
---
# Make ambiguous symbol handling consistent across symbol_graph, trace, and impact
## Summary
Real tool-call testing found inconsistent handling of ambiguous symbol names across tools.

## Reproduction
Use the ambiguous symbol `sha256Hex` in this repo.

### `symbol_graph`
- Call: `symbol_graph(name: "sha256Hex")`
- Actual: returns a multi-match disambiguation list.
- This is good.

### `resolve_edge`
- Call with `source: "sha256Hex"`
- Actual: returns an ambiguity error asking for `sourceFile`.
- This is also good.

### `trace`
- Call: `trace(entry: "sha256Hex")`
- Actual: returns `Entry "sha256Hex" not found`
- Problem: the symbol exists, but is ambiguous, not missing.

### `impact`
- Call: `impact(symbols: ["sha256Hex"], changeType: "signature_change")`
- Actual: silently aggregates all matching symbols and returns a blended impact result.
- Problem: no warning or disambiguation, so the report may over-broaden scope.

## Expected
Ambiguous symbols should be handled consistently across tools. Possible acceptable behaviors:
- explicit disambiguation list and request for `file`, or
- documented multi-match semantics with explicit messaging.

## Actual
- `symbol_graph`: disambiguates
- `resolve_edge`: disambiguates
- `trace`: reports ambiguous symbol as not found
- `impact`: silently aggregates all matches

## Impact
Medium-high. This can mislead agents and users during exploration and change analysis, especially on common helper names reused across source and tests.

