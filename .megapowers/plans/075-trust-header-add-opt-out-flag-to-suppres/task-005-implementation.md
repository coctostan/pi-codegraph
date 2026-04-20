# Task 5 Implementation

## Summary
- Added `test/extension-suppress-trust-header-interactions.test.ts` to lock the composed suppress-Trust-header contract.
- Covered the stale readonly indexing note, `CODEGRAPH_DEVMETA` footer, fresh/stale symbol_graph body preservation, and `suppressTrustHeader: false` parity with omitted on `trace`.
- Adjusted the stale-body assertion to remove only the 3-line Trust block while preserving any leading `indexing-failed ...` note, which is part of the intended output.

## Files Changed
- `test/extension-suppress-trust-header-interactions.test.ts`

## Test Results
### Targeted test
```text
$ bun test test/extension-suppress-trust-header-interactions.test.ts
bun test v1.3.11 (af24e281)

test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB [508.30ms]
(pass) suppressTrustHeader:true still appends _meta footer when CODEGRAPH_DEVMETA=1 [541.30ms]
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph) [818.97ms]
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph) [842.29ms]
(pass) suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh) [433.56ms]

 5 pass
 0 fail
 13 expect() calls
Ran 5 tests across 1 file. [3.37s]
```

### Full suite
```text
$ bun test
401 pass
0 fail
1168 expect() calls
Ran 401 tests across 162 files. [12.51s]
```
