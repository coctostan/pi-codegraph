# Bugfix Summary: impact() empty output diagnostics (#042, #043)

## Root Cause

Two bugs in `src/tools/impact.ts` where the `impact()` rendering function returned empty bodies instead of diagnostic messages:

1. **#042 — Not-found symbol:** The `not_found` branch at line 148 passed `""` to `prependTrustHeader` instead of `resolved.text`, discarding the `'Symbol "X" not found'` message that `resolveUniqueSymbol` already produced. Copy-paste inconsistency — the adjacent `ambiguous` branch correctly used `resolved.text`.

2. **#043 — Addition change type:** The data layer correctly returns `[]` for additions, but the rendering layer at line 160 treated zero hits as "no impact" with an empty body. No distinction between "zero dependents found" and "analysis not supported."

## Fix Approach

- **#042:** Changed `""` → `resolved.text` on the not_found branch, matching the pattern used by `trace.ts`.
- **#043:** Added early return with explicit diagnostic message before `collectImpactDetails` when `changeType === "addition"`. Placed after symbol resolution (so not-found diagnostics still work for addition) and before compute (avoids wasted work).

## Files Changed

- `src/tools/impact.ts` — 2 changes in the `impact()` function
- `test/tool-impact-empty-output.test.ts` — regression tests (written during reproduction)

## How to Verify

```bash
bun test test/tool-impact-empty-output.test.ts
# 2 pass, 0 fail

bun test
# 244 pass, 0 fail
```
