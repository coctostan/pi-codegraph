# Implement phase completion

All implementation work for issue 065 is complete.

## Files changed
- `src/tools/impact.ts`
- `test/tool-impact-empty-symbols.test.ts`

## Implemented behavior
- `impact()` still returns the Trust-header-wrapped diagnostics for empty or `undefined` `symbols`, with the minimal invocation example preserved.
- `impact()` rejects invalid `changeType` values through a shared validation helper and lists the valid literals.
- `collectImpactDetails()` now rejects invalid runtime `changeType` values by throwing a clean `Error` with the same valid-literals message, instead of silently returning `[]`.
- `collectImpactDetails()` keeps the empty/`undefined` `symbols` short-circuit to `[]`.
- Regression coverage now includes the direct internal invalid-`changeType` case via `collectImpact()`.

## Latest test evidence from implementation
- Targeted: `bun test test/tool-impact-empty-symbols.test.ts` → `6 pass`, `0 fail`
- Full suite: `bun test` → `450 pass`, `0 fail`
- Typecheck: `bun run check` → exit `0`

## Handoff to verify
Verify should rerun the issue reproduction and confirm that invalid `changeType` is now rejected both at the public `impact()` entry and at the internal `collectImpact()` / `collectImpactDetails()` layer.
