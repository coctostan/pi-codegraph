# Task 001 Implementation

## Summary
Added a `devModeEnabled` helper that parses `CODEGRAPH_DEVMODE` from an env-like object and recognizes the approved truthy values.

## Files
- `src/config/dev-mode.ts`
- `test/dev-mode.test.ts`

## Verification
- `bun test test/dev-mode.test.ts` ✅
- `bun test` ✅
