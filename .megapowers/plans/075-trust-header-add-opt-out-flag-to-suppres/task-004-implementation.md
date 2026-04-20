# Task 4 Implementation

## Summary
- Added optional `suppressTrustHeader` to `TraceParams` in `src/index.ts`.
- Forwarded `params.suppressTrustHeader === true` from the `trace` tool execute path into `finalizeReadOnlyOutput(...)`.
- Added the trace-specific regression test covering schema exposure and Trust-header suppression behavior.

## Files Changed
- `src/index.ts`
- `test/extension-suppress-trust-header-trace.test.ts`

## Test Results
### Targeted test
```text
$ bun test test/extension-suppress-trust-header-trace.test.ts
bun test v1.3.11 (af24e281)

test/extension-suppress-trust-header-trace.test.ts:
(pass) trace schema advertises suppressTrustHeader as an optional boolean [1.08ms]
(pass) trace with suppressTrustHeader:true omits the non-fresh Trust header [296.59ms]

 2 pass
 0 fail
 5 expect() calls
Ran 2 tests across 1 file. [433.00ms]
```

### Full suite
```text
$ bun test
396 pass
0 fail
1155 expect() calls
Ran 396 tests across 161 files. [11.37s]
```
