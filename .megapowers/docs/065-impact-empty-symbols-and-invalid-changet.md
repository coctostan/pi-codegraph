# Bugfix Summary — #065

## Title
`impact`: return explicit diagnostics for empty/missing `symbols` and invalid `changeType`

## Root Cause
`impact()` in `src/tools/impact.ts` assumed its inputs had already been validated at the tool boundary.
That assumption was false for direct callers and incomplete for the tool path because `symbols: []` was still allowed through the schema.

Before this fix:
- `symbols: []` fell through to the empty-hit path and returned a Trust header with no body
- `symbols: undefined` threw at the top-level `for...of` loop
- invalid `changeType` values fell through classification and also returned a Trust header with no body

## Fix Approach
The fix adds two defensive entry guards in `impact()` before symbol resolution and before the existing `addition` branch:

1. Reject `undefined` or empty `symbols` with a Trust-wrapped error and a minimal example.
2. Reject invalid `changeType` values with a Trust-wrapped error listing the four valid literals.
3. Keep the rest of the function behavior unchanged for valid inputs.
4. Add a dedicated regression file covering all three invalid-input cases.

## Modified API Surface
### `impact`
```ts
(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}) => string
```

The signature did not change. The behavior changed for invalid inputs at the function boundary.

## Files Changed
- `src/tools/impact.ts`
  - added the `symbols` guard immediately after stats initialization
  - added the runtime `changeType` allowlist guard before symbol resolution
- `test/tool-impact-empty-symbols.test.ts`
  - added regression tests for empty array, `undefined`, and invalid `changeType`

## Key Implementation Detail
The guards remain Trust-header-wrapped via `prependTrustHeader(..., { stats })`, matching the existing diagnostic pattern already used by other `impact()` early exits.
That preserves tool output shape and avoids regressions in trust-header tests.

## How to Verify
- Reproduce the original direct-call cases and confirm they now return diagnostics instead of empty output or a throw.
- Run:
  - `bun test test/tool-impact-empty-symbols.test.ts`
  - `bun test test/tool-impact*.test.ts test/extension-impact.test.ts test/token-tracker-all-tools.test.ts`
  - `bun test`

## Verification Outcome
Verified in this session:
- direct-call reproduction no longer throws or returns silent empty output
- dedicated regression file passes
- impact-focused regression suite passes
- full suite passes
