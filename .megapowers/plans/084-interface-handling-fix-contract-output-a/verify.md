## Test Suite Results

### Full suite
**Command:** `bun test`

**Actual output (issue-relevant excerpts + summary):**
```text
test/signature-extract-interface.test.ts:
(pass) extractFile preserves interface header and members in signature [7.14ms]

test/repro-084-interface-handling.test.ts:
(pass) repro #076: symbolGraph contract output for interfaces should list interface members [2.15ms]
(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [1.44ms]

test/tool-symbol-contract-happy.test.ts:
(pass) symbolContract renders full contract with takes, returns, throws, guards, and test behaviors [2.59ms]

test/tool-symbol-contract-generic-sig.test.ts:
(pass) symbolContract correctly parses signature with nested generic type params [1.56ms]

test/signature-round-trip.test.ts:
(pass) signature round-trips through findNodes [0.58ms]
(pass) signature round-trips through getNodesByFile [0.40ms]
(pass) signature round-trips through getNeighbors [0.30ms]
(pass) nodes without signature have undefined signature field [0.22ms]

test/tool-symbol-graph-lsp.test.ts:
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.91ms]
(pass) resolveImplementations removes stale persisted lsp implements edges when marker already exists [0.43ms]
(pass) tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section [265.32ms]

test/typecheck.test.ts:
(pass) tsc --noEmit passes with no type errors [925.67ms]

376 pass
0 fail
1099 expect() calls
Ran 376 tests across 154 files. [9.69s]
```

### Focused regression suite
**Command:** `bun test test/repro-084-interface-handling.test.ts test/signature-extract-interface.test.ts test/indexer-extract-file.test.ts test/tool-symbol-contract-happy.test.ts test/tool-symbol-contract-generic-sig.test.ts test/signature-round-trip.test.ts test/tool-symbol-graph-lsp.test.ts`

**Actual output:**
```text
test/signature-extract-interface.test.ts:
(pass) extractFile preserves interface header and members in signature [12.65ms]

test/tool-symbol-contract-generic-sig.test.ts:
(pass) symbolContract correctly parses signature with nested generic type params [9.00ms]

test/signature-round-trip.test.ts:
(pass) signature round-trips through findNodes [0.77ms]
(pass) signature round-trips through getNodesByFile [0.43ms]
(pass) signature round-trips through getNeighbors [0.24ms]
(pass) nodes without signature have undefined signature field [0.66ms]

test/repro-084-interface-handling.test.ts:
(pass) repro #076: symbolGraph contract output for interfaces should list interface members [3.76ms]
(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [3.23ms]

test/tool-symbol-contract-happy.test.ts:
(pass) symbolContract renders full contract with takes, returns, throws, guards, and test behaviors [2.33ms]

test/indexer-extract-file.test.ts:
(pass) extractFile returns module node with stable id and SHA-256 content hash [0.10ms]
(pass) extractFile extracts non-exported function declarations (criterion 1) [0.22ms]
(pass) extractFile extracts function declarations and arrow function assignments [0.26ms]
(pass) extractFile extracts class and interface declarations [0.11ms]
(pass) extractFile extracts import edges for named, aliased, and default imports [0.46ms]
(pass) extractFile resolves aliased import calls to the original exported name [0.13ms]
(pass) extractFile extracts calls edges for bare calls + constructors, ignoring method calls [0.20ms]
(pass) extractFile returns empty nodes/edges (but no throw) when the parse has errors [0.09ms]
(pass) extractFile records call-site coordinates in calls evidence (bare call)
(pass) extractFile records constructor call-site coordinates in calls evidence (new expression) [0.17ms]

test/tool-symbol-graph-lsp.test.ts:
(pass) resolveMissingCallers persists callers and writes marker; second run skips references() [1.72ms]
(pass) resolveMissingCallers ignores self-reference at declaration location [0.40ms]
(pass) resolveMissingCallers re-resolves after file re-index (stale marker edge cleared) [0.51ms]
(pass) tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render [480.89ms]
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.89ms]
(pass) resolveImplementations removes stale persisted lsp implements edges when marker already exists [0.51ms]
(pass) tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section [274.83ms]
(pass) non-interface symbol_graph output remains unchanged (no Implemented By section) [146.43ms]
(pass) resolveMissingCallers: transient error does NOT set marker — next call retries [0.80ms]
(pass) resolveMissingCallers: startup error DOES set marker — second call is skipped [0.47ms]
(pass) resolveMissingCallers: error catch block does NOT create fake lsp-provenance edges [0.41ms]
(pass) symbol_graph Implemented By section includes agent-provenance implements edges [358.97ms]

31 pass
0 fail
97 expect() calls
Ran 31 tests across 7 files. [1438.00ms]
```

### Impact / downstream coverage check
**Command:** `impact({ symbols:["extractInterfaceSignature","renderSymbolContractBody","resolveImplementations"], changeType:"behavior_change", maxDepth:4 })`

**Output:**
```text
src/indexer/tree-sitter.ts:194:5229  extractFile  behavioral  depth:1  [fan-in:1, fan-out:13, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/symbol-contract.ts:262:2557  symbolContract  behavioral  depth:1  [fan-in:0, fan-out:2, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/repro-084-interface-handling.test.ts:11:f0f6  addIndexedFile  behavioral  depth:2  [fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

**Test-surface checks:**
```text
grep resolveImplementations in test/**/*.test.ts:
[11 matches in 2 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-graph-lsp.test.ts: 8 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-084-interface-handling.test.ts: 3 matches

grep symbolContract|renderSymbolContractBody in test/**/*.test.ts:
[30 matches in 9 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-graph-contract-include.test.ts: 6 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-no-body.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-not-found.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-no-signature.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-wiring.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-happy.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-no-tests.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-generic-sig.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-symbol-contract-ambiguous.test.ts: 3 matches

grep extractFile in test/**/*.test.ts:
[97 matches in 15 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-extract-file.test.ts: 21 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/signature-extract-function.test.ts: 13 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/signature-extract-class.test.ts: 11 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/signature-extract-arrow.test.ts: 9 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/signature-extract-generics.test.ts: 9 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-reexports.test.ts: 7 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-namespace-imports.test.ts: 5 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-dynamic-imports.test.ts: 5 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/indexer-exported-symbols.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/signature-extract-interface.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/signature-extract-module.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/readonly-graceful-degradation.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/last-index-error-clear-on-health.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-readonly-trust-gating.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-084-interface-handling.test.ts: 2 matches
```

**Verification:** The full suite and focused suite both ran the surfaced downstream areas: `extractFile`, `symbolContract`, and the repro helper path. Resolver-specific coverage also ran in `test/tool-symbol-graph-lsp.test.ts` and `test/repro-084-interface-handling.test.ts`.

## Per-Criterion Verification

### Criterion 1: `symbol_graph({ name: "GraphStore", include: ["contract"] })` renders interface members from the interface body, not `### Takes\n  interface GraphStore`.
**Identify:** Direct tool output for the real repo symbol, plus the #076 repro test, plus a trace through the contract entry path.

**Run / Read:**
```text
symbol_graph({ name:"GraphStore", file:"src/graph/store.ts", include:["contract","neighborhood"] })

## GraphStore (interface)
src/graph/store.ts:30:c121 [entry-point, leaf, untested]
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp [leaf, untested]

## Contract: GraphStore
src/graph/store.ts:30:c121

### Methods
  addNode(node: GraphNode): void
  addEdge(edge: GraphEdge): void
  getNode(id: string): GraphNode | null
  findNodes(name: string, file?: string): GraphNode[]
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[]
  getNodesByFile(file: string): GraphNode[]
  deleteFile(file: string): void
  listFiles(): string[]
  getFileHash(file: string): string | null
  setFileHash(file: string, hash: string): void
  getUnresolvedEdges(): GraphEdge[]
  getEdgesBySource(sourceId: string): GraphEdge[]
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void
  saveTestTrace(trace: TestTraceRecord): void
  getTestTrace(testNodeId: string): TestTraceRecord | null
  getStatistics(projectRoot?: string): GraphStatistics
  queryRows<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  close(): void
```

```text
trace({ entry:"symbolContract", file:"src/tools/symbol-contract.ts" })

src/tools/symbol-contract.ts:262:2557  symbolContract  function [entry-point, untested]
src/tools/symbol-contract.ts:147:aece  renderSymbolContractBody  function [untested]
src/tools/symbol-contract.ts:98:d8d5  extractInterfaceSectionsFromSource  function [untested]
src/tools/symbol-contract.ts:117:cba4  extractInterfaceSectionsFromSignature  function [leaf, untested]
src/tools/symbol-contract.ts:130:0fb1  pushInterfaceContractSections  function [leaf, untested]
```

```text
read(src/indexer/tree-sitter.ts, symbol:"extractInterfaceSignature")
179:28c|function extractInterfaceSignature(node: SyntaxNode, name: string): string {
189:9b0|  const members = extractInterfaceMembers(node);
190:3d4|  return members.length > 0 ? [header, ...members].join("\n") : header;
191:b18|}

read(src/tools/symbol-contract.ts, symbol:"renderSymbolContractBody")
180:90d|  let interfaceSections: InterfaceContractSections | null = null;
181:4c4|  if (node.kind === "interface" && node.signature) {
182:74d|    const fromSignature = extractInterfaceSectionsFromSignature(node.signature);
187:667|  if (!interfaceSections && node.kind === "interface" && fileContent && node.start_line && node.end_line) {
188:d1c|    const fromSource = extractInterfaceSectionsFromSource(fileContent, node.start_line, node.end_line);
194:730|  if (interfaceSections) {
195:c81|    pushInterfaceContractSections(lines, interfaceSections);
```

```text
Focused regression suite:
(pass) repro #076: symbolGraph contract output for interfaces should list interface members [3.76ms]
```

**Verify:** The live `symbol_graph` output for `GraphStore` contains `### Methods` and the full interface member list. The old broken output `### Takes\n  interface GraphStore` is absent. The trace reaches `renderSymbolContractBody`, and the source anchors show interface members are extracted and rendered through the interface-specific path.

**Verdict:** pass

### Criterion 2: `symbol_graph({ name: "GraphStatistics", include: ["contract"] })` renders the interface fields/types from the interface body.
**Identify:** Direct tool output for `GraphStatistics`, plus the #076 repro test.

**Run / Read:**
```text
symbol_graph({ name:"GraphStatistics", file:"src/graph/store.ts", include:["contract","neighborhood"] })

## GraphStatistics (interface)
src/graph/store.ts:24:b453 [entry-point, leaf, untested]

## Contract: GraphStatistics
src/graph/store.ts:24:b453

### Fields
  nodes: Record<string, number>
  edges: Record<string, Record<string, number>>
  files: { total: number; stale: number }
```

```text
Focused regression suite:
(pass) repro #076: symbolGraph contract output for interfaces should list interface members [3.76ms]
```

**Verify:** The live tool output renders `### Fields` with the concrete field types from the interface body. The old symptom of a near-empty contract is not present.

**Verdict:** pass

### Criterion 3: Function contract rendering continues to pass existing contract tests; non-interface signature round-tripping is unchanged.
**Identify:** Existing contract tests, generic-signature tests, signature round-trip tests, extract-file tests, and the full-suite typecheck.

**Run / Read:**
```text
Focused regression suite:
(pass) symbolContract renders full contract with takes, returns, throws, guards, and test behaviors [2.33ms]
(pass) symbolContract correctly parses signature with nested generic type params [9.00ms]
(pass) signature round-trips through findNodes [0.77ms]
(pass) signature round-trips through getNodesByFile [0.43ms]
(pass) signature round-trips through getNeighbors [0.24ms]
(pass) nodes without signature have undefined signature field [0.66ms]
(pass) extractFile preserves interface header and members in signature [12.65ms]
(pass) extractFile extracts class and interface declarations [0.11ms]
```

```text
Full suite:
(pass) tsc --noEmit passes with no type errors [925.67ms]
376 pass
0 fail
```

```text
read(src/tools/symbol-contract.ts, symbol:"renderSymbolContractBody")
194:730|  if (interfaceSections) {
195:c81|    pushInterfaceContractSections(lines, interfaceSections);
196:524|  } else if (node.signature) {
197:40e|    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
198:22a|    if (sigParams.length > 0) {
```

**Verify:** Existing non-interface contract tests passed. Signature round-trip tests passed. The fallback path for non-interface signatures still routes through `parseSignatureParams` only when no interface-specific sections are used.

**Verdict:** pass

### Criterion 4: `resolveImplementations` only persists an `implements` edge when the class declaration actually implements the target interface; an in-class return-site/location like `src/graph/sqlite.ts:289:12` no longer creates a class-level `implements` edge.
**Identify:** #077 repro test, resolver regression tests, AST search for the declaration guard at both write sites, `trace` for the resolver path, and the live class source for `SqliteGraphStore`.

**Run / Read:**
```text
Focused regression suite:
(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [3.23ms]
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.89ms]
(pass) resolveImplementations removes stale persisted lsp implements edges when marker already exists [0.51ms]
```

```text
ast_search("classImplementsInterface($A, $B, $C, $D, $E)", path:"src/indexer/lsp-resolver.ts")
--- src/indexer/lsp-resolver.ts ---
>>153:cdc|        if (!classImplementsInterface(projectRoot, classNode.file, classNode.name, node.name, classNode.signature)) continue;
>>207:2f0|    if (!classImplementsInterface(projectRoot, implNode.file, implNode.name, node.name, implNode.signature)) continue;
```

```text
trace({ entry:"resolveImplementations", file:"src/indexer/lsp-resolver.ts" })

src/indexer/lsp-resolver.ts:138:e1d9  resolveImplementations  function [entry-point, untested]
src/indexer/lsp-resolver.ts:64:c58e  classImplementsInterface  function [untested]
src/indexer/lsp-resolver.ts:144:6ebb  syncDeclaredImplementations  function [untested]
src/indexer/lsp-resolver.ts:187:ce33  addFallbackImplementations  function [untested]
```

```text
read(src/indexer/lsp-resolver.ts, symbol:"resolveImplementations")
202:366|  for (const implLoc of impls) {
203:b68|    const implNode = store
207:2f0|    if (!classImplementsInterface(projectRoot, implNode.file, implNode.name, node.name, implNode.signature)) continue;
208:59d|    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
210:62c|    store.addEdge({
```

```text
symbol_graph({ name:"SqliteGraphStore", file:"src/graph/sqlite.ts", include:["source"] })

## SqliteGraphStore (class)
src/graph/sqlite.ts:37:9c6d

### Signature
class SqliteGraphStore implements GraphStore { constructor(dbPath: string) }

### Key Relationships
  Implements (1):  GraphStore
    GraphStore: interface GraphStore

### Source
37:9c6d|export class SqliteGraphStore implements GraphStore {
```

**Verify:** The repro test that previously encoded the false-positive case now passes. Both write sites in `resolveImplementations` are structurally guarded by `classImplementsInterface(...)` before `addEdge(...)`. The live `SqliteGraphStore` declaration proves the class implements `GraphStore`, not `GraphStatistics`.

**Verdict:** pass

### Criterion 5: `symbol_graph("GraphStatistics")` no longer shows `SqliteGraphStore` under `Implemented By`, while `symbol_graph("GraphStore")` and existing positive implementation tests still show valid implementing classes.
**Identify:** Direct live `symbol_graph` outputs for both symbols, resolver tool-path tests, and the tool entry source showing interface symbols go through `resolveImplementations`.

**Run / Read:**
```text
symbol_graph({ name:"GraphStatistics", file:"src/graph/store.ts", include:["contract","neighborhood"] })

## GraphStatistics (interface)
src/graph/store.ts:24:b453 [entry-point, leaf, untested]

## Contract: GraphStatistics
src/graph/store.ts:24:b453

### Fields
  nodes: Record<string, number>
  edges: Record<string, Record<string, number>>
  files: { total: number; stale: number }
```

```text
symbol_graph({ name:"GraphStore", file:"src/graph/store.ts", include:["contract","neighborhood"] })

## GraphStore (interface)
src/graph/store.ts:30:c121 [entry-point, leaf, untested]
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp [leaf, untested]
```

```text
read(src/index.ts, offset:196, limit:12)
196:d10|      if (nodes.length === 1) {
197:0ed|        resolvedNode = nodes[0]!;
198:832|        const client = new TsServerClient(projectRoot);
199:a6c|        try {
200:71d|          await resolveMissingCallers(resolvedNode, store, projectRoot, client);
201:ba1|          if (resolvedNode.kind === "interface") {
202:cae|            await resolveImplementations(resolvedNode, store, projectRoot, client);
203:b18|          }
```

```text
Focused regression suite:
(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [3.23ms]
(pass) tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section [274.83ms]
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.89ms]
```

**Verify:** `GraphStatistics` no longer has an `Implemented By` section in live tool output. `GraphStore` still has `Implemented By -> SqliteGraphStore`. The interface tool path still invokes `resolveImplementations`, and the positive resolver test still passes.

**Verdict:** pass

## Overall Verdict
pass

The implementation satisfies all five acceptance criteria. Evidence includes a fresh full-suite run (`376 pass, 0 fail`), focused regression runs (`31 pass, 0 fail`), direct `symbol_graph` reproduction against `GraphStore` and `GraphStatistics`, trace output through the contract and resolver paths, and anchored source/AST evidence showing the interface-specific rendering branch and declaration-based `implements` guard are present on the executed code paths.
