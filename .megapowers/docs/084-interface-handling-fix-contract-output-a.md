# Bugfix Summary: Interface Contract Output and False Implements Edges

**Issues:** #076, #077 (batch: #084)
**Branch:** fix/084-interface-handling-fix-contract-output-a

---

## Root Cause

Two separate bugs in the indexing/rendering pipeline, both specific to interface handling:

### Bug #076 — Interface contract showed `### Takes\n  interface GraphStore`

`extractInterfaceSignature` (`src/indexer/tree-sitter.ts`) only stored the declaration header (`interface GraphStore`) and never walked the interface body. When `renderSymbolContractBody` received this string, it fed it into `parseSignatureParams`, which treats every signature as a function. Since `interface GraphStore` has no `=>`, the parser emitted a single "param" token — `interface GraphStore` — producing the broken output.

**Root cause location:** `extractInterfaceSignature` at `src/indexer/tree-sitter.ts:164-175` — members were never extracted from the AST node body.

### Bug #077 — `GraphStatistics` showed a false `Implemented By: SqliteGraphStore` edge

`resolveImplementations` (`src/indexer/lsp-resolver.ts`) trusted LSP `implementations()` locations without validating them against the class `implements` clause. The LSP returned `src/graph/sqlite.ts:289:12` — the `return { nodes, edges, files: ... }` line inside `getStatistics()` — as a location for `GraphStatistics`. The resolver found `SqliteGraphStore` as the enclosing class and wrote the edge unconditionally. The stricter `classImplementsInterface()` check existed only in the fallback path, not the LSP-success path.

**Root cause location:** `resolveImplementations` at `src/indexer/lsp-resolver.ts:168-188` — `classImplementsInterface()` guard was missing before `addEdge()`.

---

## Fix Approach

### #076 fix (two-layer)

**Layer 1 — Indexer (`src/indexer/tree-sitter.ts`):**
Added `extractInterfaceMembers()` which walks the interface body AST and collects `method_signature`, `property_signature`, `index_signature`, and `call_signature` nodes. Updated `extractInterfaceSignature()` to append these members as newline-separated lines after the header: `"interface Foo\nmember1\nmember2"`.

**Layer 2 — Renderer (`src/tools/symbol-contract.ts`):**
Added `extractInterfaceSectionsFromSignature()` to parse the stored multiline signature into `{ methods, fields }`. Added `extractInterfaceSectionsFromSource()` as a fallback that reads the source file directly for nodes without a stored signature. Added `pushInterfaceContractSections()` to render `### Methods` and `### Fields` sections. Updated `renderSymbolContractBody()` to try the signature-based path first, then the source-based path, before falling back to `parseSignatureParams()` for non-interface symbols.

### #077 fix

Promoted `classImplementsInterface()` into the LSP-success path in `resolveImplementations()`. After finding the enclosing class for each LSP location, the resolver now checks whether the class signature (or declaration text) contains `implements <InterfaceName>` before calling `addEdge()`. Additionally refactored `syncDeclaredImplementations()` to scan all indexed class nodes and reconcile declared-vs-persisted `implements` edges on every call, cleaning up stale false-positives automatically.

---

## Files Changed

| File | Change |
|------|--------|
| `src/indexer/tree-sitter.ts` | Added `extractInterfaceMembers()`; updated `extractInterfaceSignature()` to include members in stored signature |
| `src/tools/symbol-contract.ts` | Added `InterfaceContractSections`, `splitInterfaceMembers()`, `extractInterfaceSectionsFromSignature()`, `extractInterfaceSectionsFromSource()`, `pushInterfaceContractSections()`; updated `renderSymbolContractBody()` to branch on interface kind |
| `src/indexer/lsp-resolver.ts` | Added `signatureImplementsInterface()`; updated `classImplementsInterface()` to prefer stored signature; added `syncDeclaredImplementations()` inner function; guarded LSP-success `addEdge()` with `classImplementsInterface()` check |
| `test/signature-extract-interface.test.ts` | Updated test to assert full multiline signature with members |
| `test/tool-symbol-graph-lsp.test.ts` | Updated positive `resolveImplementations` fixture to include `signature` field so the stricter check validates correctly |
| `test/repro-084-interface-handling.test.ts` | New regression test file with end-to-end repros for both #076 and #077 |

---

## Verification

**Full suite:** `376 pass, 0 fail` (`bun test`)

**Key passing tests:**
- `repro #076: symbolGraph contract output for interfaces should list interface members`
- `repro #077: resolveImplementations should not add an implements edge from a return-site match`
- `extractFile preserves interface header and members in signature`
- `symbolContract renders full contract with takes, returns, throws, guards, and test behaviors` (no regression)
- `symbolContract correctly parses signature with nested generic type params` (no regression)
- `resolveImplementations persists implements edges and marker; second run skips implementations()`
- `resolveImplementations removes stale persisted lsp implements edges when marker already exists`
- `tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section`

**Live tool output confirmation:**
- `symbol_graph("GraphStore", include:["contract"])` → renders `### Methods` with all 18 interface members
- `symbol_graph("GraphStatistics", include:["contract"])` → renders `### Fields` with the 3 data fields
- `symbol_graph("GraphStatistics")` → no `Implemented By` section
- `symbol_graph("GraphStore")` → `Implemented By: SqliteGraphStore` still present
