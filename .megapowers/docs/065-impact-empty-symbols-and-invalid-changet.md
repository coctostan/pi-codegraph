# Bugfix Summary — impact input validation gaps (#065)

## What broke
Direct callers of `impact()` could bypass the TypeBox tool-boundary schema and hit two bad behaviors:
- `symbols: undefined` threw a runtime `TypeError`
- `symbols: []` and invalid `changeType` values returned the same empty Trust header used for legitimate no-result cases

## Root cause
The exported `impact()` function at `src/tools/impact.ts:132` assumed its inputs had already been validated. That assumption only holds on the pi tool-dispatch path (`src/index.ts:290`). Direct imports from tests or future embedders reach `impact()` without runtime guards.

The helper `collectImpactDetails()` at `src/tools/impact.ts:66` also had no explicit early-exit for empty `symbols`, so direct callers relied on incidental empty-queue behavior instead of a load-bearing guard.

## Fix approach
### `impact(params): string`
Confirmed signature:
```ts
(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}) => string
```

Added two defensive entry guards:
1. `!params.symbols || params.symbols.length === 0` → return a Trust-wrapped error explaining that `symbols` is required, with a minimal usage example on the error path.
2. `!validChangeTypes.includes(params.changeType)` → return a Trust-wrapped error listing the four supported literals: `signature_change`, `removal`, `behavior_change`, `addition`.

### `collectImpactDetails(params): ImpactDetail[]`
Confirmed signature:
```ts
(params: CollectImpactParams) => ImpactDetail[]
```

Added a defensive early-exit immediately after the existing `addition` branch:
```ts
if (!symbols || symbols.length === 0) return [];
```

This makes the empty-input invariant explicit for direct helper callers and guarantees the BFS never starts for empty `symbols`.

## Files changed
- `src/tools/impact.ts`
  - added runtime validation in `impact()`
  - added explicit empty-symbols early-return in `collectImpactDetails()`
- `test/tool-impact-empty-symbols.test.ts`
  - added regression coverage for:
    - empty `symbols: []`
    - `symbols: undefined`
    - invalid `changeType`
    - `collectImpactDetails()` empty-symbols BFS non-entry invariant

## Verification
### Targeted regression file
```bash
bun test test/tool-impact-empty-symbols.test.ts
```
Result: `4 pass, 0 fail`

### Full suite
```bash
bun test
```
Result: `448 pass, 0 fail`

### Direct symptom repro no longer fails
A direct-call reproducer now shows:
- empty `symbols` returns a Trust-wrapped `Error`
- `symbols: undefined` does not throw
- invalid `changeType` returns a Trust-wrapped `Error` with the valid literals
- `collectImpactDetails({ symbols: [] })` returns `[]` with `getNeighborsCalls: 0`

## Why this fix is low risk
The change is additive and front-loaded:
- valid callers continue through the existing logic unchanged
- the `addition` behavior is preserved
- existing impact-related tests remained green in the full-suite run
