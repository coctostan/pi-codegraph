# Bugfix #065 — `impact` silently swallowed empty `symbols` and invalid `changeType`

## Summary

`impact()` and `collectImpact()` returned a Trust-header-only response (or a raw `[]`) when callers passed `symbols: []`, `symbols: undefined`, or a `changeType` that was not one of the four supported literals. The output was visually indistinguishable from "no dependents found", so input mistakes were swallowed instead of surfaced. `collectImpact({ symbols: undefined })` additionally crashed with a raw V8 `TypeError`.

## Root Cause

Three missing input-validation guards in `src/tools/impact.ts`:

1. `impact()` (tool entry) iterated `params.symbols` without an empty/undefined guard, then fell through to `collectImpactDetails`, which also short-circuited to `[]`. The final `if (hits.length === 0) return prependTrustHeader("", { stats })` returned a Trust header with an empty body.
2. `collectImpactDetails()` destructured `{ symbols }` and ran `for (const symbol of symbols)` with no null check. `symbols: undefined` triggered `TypeError: undefined is not an object (evaluating 'symbols')`.
3. `classify()` returned `null` for any `changeType` not in the four-literal `ChangeType` union. Inside the walker, `if (!classification) continue;` silently dropped every candidate. There was no runtime `changeType` validation at either the `impact()` or `collectImpactDetails` layer; the only gate was the TypeBox MCP schema, which direct TypeScript callers bypass.

## Fix Approach

All changes live in `src/tools/impact.ts`. A new shared helper validates `changeType` once and is reused by both layers:

- New module-scope `VALID_CHANGE_TYPES` constant, `isValidChangeType()` type guard, and `formatInvalidChangeTypeMessage()` formatter — single source of truth for the four valid literals and the diagnostic copy.
- `impact()` (tool entry) gained two early-return guards before the symbol-resolution loop:
  - empty/undefined `symbols` → Trust-header-wrapped diagnostic with a minimal invocation example
  - invalid `changeType` → Trust-header-wrapped diagnostic listing the four valid literals
- `collectImpactDetails()` gained two defense-in-depth guards immediately after the existing `"addition"` short-circuit:
  - empty/undefined `symbols` → silent `[]` (preserves the existing "no work to do" contract for direct callers)
  - invalid `changeType` → throws a clean `Error` with the same valid-literals message

The empty-symbols guard at the public boundary is loud (Trust-header diagnostic). The internal guard for empty symbols stays silent (`[]`) to keep existing direct callers unaffected. The invalid-`changeType` guard is loud at both layers — there is no legitimate "silently do nothing" interpretation of an unknown literal.

## Affected Surface

Confirmed via `symbol_graph` after the fix:

- `src/tools/impact.ts` → `impact` (entry-point), guards include `!params.symbols || params.symbols.length === 0` and `!isValidChangeType(params.changeType)`.
- `src/tools/impact.ts` → `collectImpactDetails`, guards include `changeType === "addition"` and `!symbols || symbols.length === 0`; throws `Error` for invalid `changeType`.
- `src/tools/impact.ts` → new `isValidChangeType` and `formatInvalidChangeTypeMessage` leaves.
- `src/tools/impact.ts` → `collectImpact` is unchanged in shape — it picks up the new behavior via delegation to `collectImpactDetails`.

## Files Changed

- `src/tools/impact.ts` — added shared `VALID_CHANGE_TYPES` / `isValidChangeType` / `formatInvalidChangeTypeMessage`; added empty-symbols + invalid-`changeType` guards at both `impact()` and `collectImpactDetails()`.
- `test/tool-impact-empty-symbols.test.ts` — new regression file with six tests covering empty array, `undefined`, and invalid-`changeType` cases at both layers.

## Verification

- Targeted: `bun test test/tool-impact-empty-symbols.test.ts` → `6 pass, 0 fail`.
- Full suite: `bun test` → `450 pass, 0 fail`.
- Type check: `bun run check` → exit 0.
- Original reproduction script (`.megapowers/plans/065-impact-empty-symbols-and-invalid-changet/repro-065-verify.ts`) rerun shows:
  - `impact({ symbols: [] })` and `impact({ ..., changeType: "typo_change" })` now emit Trust-header-wrapped diagnostics with required substrings.
  - `collectImpact({ symbols: undefined })` returns `[]` instead of throwing a raw `TypeError`.
  - `collectImpact({ symbols: ["foo"], changeType: "typo_change" })` throws a clean `Error: changeType: invalid value "typo_change" — must be one of: signature_change, removal, behavior_change, addition`.

## How to Verify Manually

```bash
bun test test/tool-impact-empty-symbols.test.ts
bun .megapowers/plans/065-impact-empty-symbols-and-invalid-changet/repro-065-verify.ts
```
