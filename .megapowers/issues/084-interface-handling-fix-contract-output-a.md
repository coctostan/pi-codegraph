---
id: 84
type: bugfix
status: done
created: 2026-04-20T10:33:24.205Z
sources: [76, 77]
---
# Interface handling: fix contract output and false-positive implements edges
Two P1 issues around how interfaces are represented across the graph and output layers.

**#77** (LSP resolver false-positives) should be fixed first — it removes spurious `implements` edges on data-only interfaces like `GraphStatistics`. Fixing this first ensures the corrected edge set is available when testing #76.

**#76** (interface contract method signatures) extends the contract extractor and renderer to emit interface member signatures instead of the useless bare `interface Foo` string. Requires changes in `src/indexer/tree-sitter.ts` (extractInterfaceSignature) and `src/tools/symbol-contract.ts` (renderSymbolContractBody).

Both issues are in the interface/implements domain and share test fixtures — doing them together avoids double-touching the same test files.
