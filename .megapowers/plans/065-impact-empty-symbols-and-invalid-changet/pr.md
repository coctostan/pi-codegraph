# PR Title
fix: return diagnostics for empty impact symbols and invalid changeType

# PR Body
## Summary
- add runtime validation in exported `impact()` for missing/empty `symbols`
- add runtime validation in exported `impact()` for invalid `changeType` values
- add a defensive early-exit in `collectImpactDetails()` for empty `symbols`
- add regression coverage for empty array, undefined symbols, invalid changeType, and no-BFS-on-empty-input behavior

## Root cause
`impact()` and `collectImpactDetails()` assumed tool-boundary validation had already run. That was true for the pi extension path, but false for direct imports from tests and any future embedded callers. As a result, bad inputs either threw (`symbols: undefined`) or collapsed into the same empty Trust header used for legitimate no-result responses.

## Verification
- `bun test test/tool-impact-empty-symbols.test.ts`
- `bun test`

Resolves #65
