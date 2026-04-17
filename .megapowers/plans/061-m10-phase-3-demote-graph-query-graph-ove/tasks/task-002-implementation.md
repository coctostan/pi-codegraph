# Task 002 Implementation

## Summary
Removed `symbol_search` from the registered extension surface while keeping the internal `symbolSearch` export and cache reset path available for non-extension callers and test helpers.
Updated the registered-tool description test to reflect the 10-tool surface after the demotion.

## Files
- `src/index.ts`
- `test/extension-symbol-search.test.ts`
- `test/extension-tool-descriptions.test.ts`

## Verification
- `bun test test/extension-symbol-search.test.ts` ✅
  - `2 pass, 0 fail`
- `bun test` ✅
  - `424 pass, 0 fail`
