# Diagnosis

## Root Cause
Confirmed root cause claim: this batch issue is caused by two separate interface-specific mismatches in the indexing/rendering pipeline, not by the SQLite store or the final formatter.

1. **Contract output bug (#076): interface member information is discarded during tree-sitter extraction, then the truncated interface header is misinterpreted as a function signature during contract rendering.**
   - `extractInterfaceSignature` only returns the declaration header and never inspects interface body members: `src/indexer/tree-sitter.ts:164-175`.
   - `extractFile` stores that header string on interface nodes: `src/indexer/tree-sitter.ts:255-269`.
   - `SqliteGraphStore.addNode` persists `node.signature` unchanged: `src/graph/sqlite.ts:109-112`.
   - The persisted DB rows confirm the stored value is only `interface GraphStatistics` / `interface GraphStore`, not member lists.
   - `renderSymbolContractBody` then passes that interface header into `parseSignatureParams`: `src/tools/symbol-contract.ts:90-103`.
   - `parseSignatureParams` has only function-signature logic; when given `interface GraphStore`, it returns a single param-like token and no return type, which is why the output becomes:
     ```text
     ### Takes
       interface GraphStore
     ```
   - Evidence from direct execution during diagnosis:
     ```json
     {"params":["interface GraphStore"],"returnType":null}
     ```
   - This means the data becomes incorrect first in `extractInterfaceSignature`, and the renderer then compounds it by assuming every `signature` string has function syntax.

2. **False `implements` edge bug (#077): `resolveImplementations` trusts any LSP implementation location that lands anywhere inside a class body, and upgrades it to a class-level `implements` edge without verifying the class declaration actually names that interface in its `implements` clause.**
   - `symbol_graph` calls `resolveImplementations` for interface nodes in the read path: `src/index.ts:196-203`.
   - In the LSP-success path, `resolveImplementations`:
     - takes each `implLoc`
     - finds any class whose line range contains that location
     - immediately writes an `implements` edge
     - without checking the class declaration text or stored class signature
     (`src/indexer/lsp-resolver.ts:168-188`).
   - The persisted false-positive edge proves this is what happened in practice:
     ```text
     src/graph/sqlite.ts::SqliteGraphStore:37|src/graph/store.ts::GraphStatistics:24|implements|lsp|src/graph/sqlite.ts:289:12
     ```
   - `src/graph/sqlite.ts:289:12` is the `return { nodes, edges, files: { total, stale } };` line, not the class declaration and not an `implements GraphStatistics` clause.
   - The fallback path is stricter: `addFallbackImplementations` calls `classImplementsInterface`, which regex-checks the class declaration for an actual `implements <Interface>` clause (`src/indexer/lsp-resolver.ts:131-154`, `58-69`). That stricter check is missing from the LSP-success path.
   - So the bad value first appears in `resolveImplementations` itself, not in storage or display.

## Trace
### #076 Contract output path
1. `symbol_graph` tool entry resolves the symbol and renders the card/body (`src/index.ts:190-218`).
2. `symbolGraph` appends the contract section when `include` contains `"contract"` (`src/tools/symbol-graph.ts:186-193`).
3. `renderSymbolContractBody` reads the already-indexed node and sees `node.signature` (`src/tools/symbol-contract.ts:88-103`).
4. That `node.signature` came from `store.findNodes`, which reads the DB value written by `SqliteGraphStore.addNode` (`src/graph/sqlite.ts:109-112`).
5. The DB value came from `extractFile`, which assigns `signature = extractInterfaceSignature(...)` for interface declarations (`src/indexer/tree-sitter.ts:255-269`).
6. `extractInterfaceSignature` is the point where correct source structure becomes incomplete stored data: it returns only `interface ${name}` or `interface ${name} extends ...`, and never serializes members (`src/indexer/tree-sitter.ts:164-175`).
7. `renderSymbolContractBody` then passes that incomplete string into `parseSignatureParams`, which is designed for function signatures only (`src/tools/symbol-contract.ts:15-60, 90-103`).
8. That is why the symptom appears as `### Takes interface GraphStore` instead of methods/fields.

### #077 False `implements` edge path
1. `symbol_graph` tool entry resolves a single interface node (`src/index.ts:195-203`).
2. Because the resolved node is an interface, the tool invokes `resolveImplementations` (`src/index.ts:201-202`).
3. `resolveImplementations` asks the LSP client for implementation locations (`src/indexer/lsp-resolver.ts:155-157`).
4. For each returned location, it finds the enclosing class by file + line-range containment only (`src/indexer/lsp-resolver.ts:168-173`).
5. If any enclosing class exists, it writes a class-level `implements` edge immediately (`src/indexer/lsp-resolver.ts:175-188`).
6. That edge is then persisted and later surfaced by neighborhood rendering as `Implemented By`.
7. The false edge to `GraphStatistics` carries evidence `src/graph/sqlite.ts:289:12`, proving the LSP location was inside `SqliteGraphStore.getStatistics()` and not on the class declaration.
8. Therefore the exact point where correct becomes incorrect is the resolver's promotion rule: **"any implementation location inside a class" ⇒ `implements` edge**.

## Affected Code
- `src/index.ts:196-203` — `symbol_graph` read path invokes `resolveImplementations` for interface symbols.
- `src/tools/symbol-graph.ts:186-193` — appends contract section output from `renderSymbolContractBody`.
- `src/tools/symbol-contract.ts:15-60` — `parseSignatureParams` only understands function-style signatures.
- `src/tools/symbol-contract.ts:90-103` — contract rendering always treats `node.signature` as function-parsable input.
- `src/indexer/tree-sitter.ts:164-175` — `extractInterfaceSignature` discards interface members/fields.
- `src/indexer/tree-sitter.ts:255-269` — `extractFile` stores that truncated interface signature on interface nodes.
- `src/graph/sqlite.ts:109-112` — DB layer persists the provided signature verbatim; it is not the source of corruption.
- `src/indexer/lsp-resolver.ts:58-69` — `classImplementsInterface` is the stricter declaration-based check used only in fallback mode.
- `src/indexer/lsp-resolver.ts:131-154` — fallback implementation path uses declaration text as ground truth.
- `src/indexer/lsp-resolver.ts:168-188` — LSP-success path writes `implements` edges from any in-class location.

## Pattern Analysis
### Working vs broken contract handling
- **Working pattern:** function contract rendering expects function-shaped signatures like `(input: string) => boolean`.
  - Covered by existing tests such as `test/tool-symbol-contract-happy.test.ts` and `test/tool-symbol-contract-generic-sig.test.ts`.
  - `parseSignatureParams` correctly extracts `Takes` and `Returns` from that format.
- **Broken pattern:** interface nodes are stored with declaration-header strings like `interface GraphStore`.
  - Covered today only by extraction tests such as `test/signature-extract-interface.test.ts`, which assert the header string and do not assert member preservation.
  - No existing contract test exercises interface symbols before the new repro.
- **Key difference:** class signature extraction already walks some body structure (`extractClassSignature` inspects the class body to capture constructor info, `src/indexer/tree-sitter.ts:130-159`), while interface signature extraction does not walk the interface body at all.
- **Violated assumption:** `renderSymbolContractBody` assumes `node.signature` is always compatible with `parseSignatureParams`. That assumption is valid for functions and some arrows, but false for interface declaration strings.

### Working vs broken implementation-edge handling
- **Working pattern:** fallback implementation resolution validates the class declaration text with `classImplementsInterface(...)` before emitting an `implements` edge.
- **Broken pattern:** the main LSP-success path skips that validation and treats any implementation location inside the class span as proof of implementation.
- **Key difference:** fallback path uses declaration semantics; LSP-success path uses line containment only.
- **Violated assumption:** `client.implementations(...)` is assumed to return only class-declaration locations that correspond to `implements` clauses. The persisted evidence line `src/graph/sqlite.ts:289:12` proves that assumption is false for `GraphStatistics`.

### Test coverage gap
- Existing tests cover:
  - positive contract rendering for functions
  - interface signature extraction as a header string
  - positive `resolveImplementations` behavior when the returned location is on the class declaration (`test/tool-symbol-graph-lsp.test.ts:212-262`)
- Existing tests do **not** cover:
  - interface contract rendering with methods/fields
  - negative `resolveImplementations` behavior when the LSP location is inside a method/return type usage rather than the declaration

## Risk Assessment
- Changing interface signature extraction affects the indexing pipeline through `extractFile` → `indexProject` → all read tools that depend on indexed node signatures.
  - `impact(extractInterfaceSignature)` shows the immediate risk surface includes `extractFile`, `indexProject`, and `piCodegraph`.
- Changing `resolveImplementations` affects the lazy interface-resolution behavior in `symbol_graph` and any persisted `implements` relationships later consumed by summary/neighborhood renderers.
  - `impact(resolveImplementations)` shows the immediate dependent surface includes `piCodegraph` and `symbolGraph`/`symbolContract` entry flows.
- Main regression risk areas:
  1. function/class signatures must continue round-tripping unchanged
  2. real `implements` edges such as `SqliteGraphStore -> GraphStore` and `Worker -> IWorker` must still be created
  3. any stored interface contract representation change may require reindex coverage in tests, because the DB faithfully stores whatever the extractor emits
- Related bugs likely share the same causes:
  - any other interface contract output will be incomplete for the same reason as `GraphStore` / `GraphStatistics`
  - any interface referenced in method return types or structurally matched inside class bodies may produce false `implements` edges if the LSP returns in-body locations

## Fixed When
1. `symbol_graph({ name: "GraphStore", include: ["contract"] })` renders interface members from the interface body, not `### Takes\n  interface GraphStore`.
2. `symbol_graph({ name: "GraphStatistics", include: ["contract"] })` renders the interface fields/types from the interface body.
3. Function contract rendering continues to pass existing contract tests; non-interface signature round-tripping is unchanged.
4. `resolveImplementations` only persists an `implements` edge when the class declaration actually implements the target interface; an in-class return-site/location like `src/graph/sqlite.ts:289:12` no longer creates a class-level `implements` edge.
5. `symbol_graph("GraphStatistics")` no longer shows `SqliteGraphStore` under `Implemented By`, while `symbol_graph("GraphStore")` and existing positive implementation tests still show valid implementing classes.
