## Test Suite Results

### Full suite
Command: `bun test`

```text
test/signature-extract-interface.test.ts:
(pass) extractFile preserves interface header and members in signature [6.85ms]

...

test/repro-084-interface-handling.test.ts:
(pass) repro #076: symbolGraph contract output for interfaces should list interface members [2.51ms]
(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [1.60ms]

...

test/tool-symbol-graph-lsp.test.ts:
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.65ms]
(pass) tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section [270.81ms]
(pass) symbol_graph Implemented By section includes agent-provenance implements edges [356.81ms]

375 pass
0 fail
1098 expect() calls
Ran 375 tests across 154 files. [9.62s]
```

### Targeted regression checks run fresh
Command: `bun test test/repro-084-interface-handling.test.ts`

```text
bun test v1.3.11 (af24e281)

test/repro-084-interface-handling.test.ts:
(pass) repro #076: symbolGraph contract output for interfaces should list interface members [16.47ms]
(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [2.96ms]

2 pass
0 fail
9 expect() calls
Ran 2 tests across 1 file. [144.00ms]
```

Command: `bun test test/tool-symbol-contract-happy.test.ts test/tool-symbol-contract-generic-sig.test.ts test/signature-round-trip.test.ts`

```text
bun test v1.3.11 (af24e281)

test/tool-symbol-contract-generic-sig.test.ts:
(pass) symbolContract correctly parses signature with nested generic type params [11.94ms]

test/signature-round-trip.test.ts:
(pass) signature round-trips through findNodes [2.80ms]
(pass) signature round-trips through getNodesByFile [0.31ms]
(pass) signature round-trips through getNeighbors [0.19ms]
(pass) nodes without signature have undefined signature field [0.97ms]

test/tool-symbol-contract-happy.test.ts:
(pass) symbolContract renders full contract with takes, returns, throws, guards, and test behaviors [3.36ms]

6 pass
0 fail
34 expect() calls
Ran 6 tests across 3 files. [146.00ms]
```

Command: `bun test test/tool-symbol-graph-lsp.test.ts`

```text
bun test v1.3.11 (af24e281)

test/tool-symbol-graph-lsp.test.ts:
(pass) resolveMissingCallers persists callers and writes marker; second run skips references() [7.92ms]
(pass) resolveMissingCallers ignores self-reference at declaration location [0.55ms]
(pass) resolveMissingCallers re-resolves after file re-index (stale marker edge cleared) [0.79ms]
(pass) tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render [454.03ms]
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.86ms]
(pass) tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section [291.23ms]
(pass) non-interface symbol_graph output remains unchanged (no Implemented By section) [157.20ms]
(pass) resolveMissingCallers: transient error does NOT set marker — next call retries [0.41ms]
(pass) resolveMissingCallers: startup error DOES set marker — second call is skipped [0.38ms]
(pass) resolveMissingCallers: error catch block does NOT create fake lsp-provenance edges [0.29ms]
(pass) symbol_graph Implemented By section includes agent-provenance implements edges [372.91ms]

11 pass
0 fail
22 expect() calls
Ran 11 tests across 1 file. [1398.00ms]
```

### Impact + downstream test coverage check
Commands run:
- `impact({ symbols:["extractInterfaceSignature"], changeType:"behavior_change", maxDepth:5 })`
- `impact({ symbols:["renderSymbolContractBody"], changeType:"behavior_change", maxDepth:5 })`
- `impact({ symbols:["classImplementsInterface"], changeType:"behavior_change", maxDepth:5 })`

Actual output:

```text
impact(extractInterfaceSignature)
indexing-failed (0s ago): Bun is not defined
src/indexer/tree-sitter.ts:194:5229  extractFile  behavioral  depth:1  [fan-in:1, fan-out:13, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/repro-084-interface-handling.test.ts:11:f0f6  addIndexedFile  behavioral  depth:2  [fan-in:0, fan-out:1, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]

impact(renderSymbolContractBody)
src/tools/symbol-contract.ts:262:2557  symbolContract  behavioral  depth:1  [fan-in:0, fan-out:2, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]

impact(classImplementsInterface)
src/indexer/lsp-resolver.ts:146:ce33  addFallbackImplementations  behavioral  depth:1  [fan-in:1, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/indexer/lsp-resolver.ts:138:e1d9  resolveImplementations  behavioral  depth:1  [fan-in:0, fan-out:5, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

Supporting grep summaries:

```text
grep("extractFile", summary:true)
97 matches in 15 files
  test/indexer-extract-file.test.ts
  test/signature-extract-function.test.ts
  test/signature-extract-class.test.ts
  test/signature-extract-arrow.test.ts
  test/signature-extract-generics.test.ts
  test/indexer-reexports.test.ts
  test/indexer-namespace-imports.test.ts
  test/indexer-dynamic-imports.test.ts
  test/indexer-exported-symbols.test.ts
  test/signature-extract-module.test.ts
  test/signature-extract-interface.test.ts
  test/extension-readonly-trust-gating.test.ts
  test/last-index-error-clear-on-health.test.ts
  test/readonly-graceful-degradation.test.ts
  test/repro-084-interface-handling.test.ts

grep("symbolContract", summary:true)
26 matches in 9 files
  test/tool-symbol-graph-contract-include.test.ts
  test/tool-symbol-contract-no-body.test.ts
  test/tool-symbol-contract-not-found.test.ts
  test/tool-symbol-contract-happy.test.ts
  test/tool-symbol-contract-no-tests.test.ts
  test/tool-symbol-contract-ambiguous.test.ts
  test/tool-symbol-contract-no-signature.test.ts
  test/tool-symbol-contract-generic-sig.test.ts
  test/tool-symbol-contract-wiring.test.ts

grep("resolveImplementations", summary:true)
9 matches in 2 files
  test/tool-symbol-graph-lsp.test.ts
  test/repro-084-interface-handling.test.ts
```

Verification of coverage claim:
- `extractFile` and `symbolContract` each have multiple direct tests, and those files were present in the fresh full-suite run.
- `resolveImplementations` also has direct tests, and those files were present in the fresh full-suite run.
- `addFallbackImplementations` does **not** have a directly named standalone test in the suite; fallback behavior was only manually exercised in the fresh in-memory reproduction below. So the suite covers the changed area strongly, but not every impacted local helper with a dedicated named test.

## Per-Criterion Verification

### Criterion 1: `symbol_graph({ name: "GraphStore", include: ["contract"] })` renders interface members from the interface body, not `### Takes\n  interface GraphStore`.

**Identify**
- Run `symbol_graph` on `GraphStore` with `include:["contract"]`.
- Compare the output to the source interface in `src/graph/store.ts`.
- Use `trace` from the contract entry path to confirm the interface-member code is on the executed path.

**Run / Read**

Command: `symbol_graph({ name:"GraphStore", file:"src/graph/store.ts", include:["contract"] })`

```text
## GraphStore (interface)
src/graph/store.ts:30:c121

### Signature
interface GraphStore

### Signals
[entry-point, leaf, untested]

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

Source of truth:

```text
src/graph/store.ts
30:89f|export interface GraphStore {
31:fce|  addNode(node: GraphNode): void;
32:f3a|  addEdge(edge: GraphEdge): void;
33:1c3|  getNode(id: string): GraphNode | null;
34:db7|  findNodes(name: string, file?: string): GraphNode[];
35:f12|  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
36:941|  getNodesByFile(file: string): GraphNode[];
37:523|  deleteFile(file: string): void;
38:c0b|  listFiles(): string[];
39:af5|  getFileHash(file: string): string | null;
40:c58|  setFileHash(file: string, hash: string): void;
41:f49|  getUnresolvedEdges(): GraphEdge[];
42:c28|  getEdgesBySource(sourceId: string): GraphEdge[];
43:36c|  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
44:564|  saveTestTrace(trace: TestTraceRecord): void;
45:375|  getTestTrace(testNodeId: string): TestTraceRecord | null;
46:49f|  getStatistics(projectRoot?: string): GraphStatistics;
47:363|  queryRows<T extends Record<string, unknown>>(sql: string, params?: unknown[]): T[];
48:feb|  close(): void;
49:b18|}
```

Trace evidence:

```text
trace({ entry:"symbolContract", file:"src/tools/symbol-contract.ts" })
## Trust
status: heuristic
...
src/tools/symbol-contract.ts:262:2557  symbolContract  function [entry-point, untested]
...
src/tools/symbol-contract.ts:147:aece  renderSymbolContractBody  function [untested]
...
src/tools/symbol-contract.ts:98:d8d5  extractInterfaceSectionsFromSource  function [untested]
src/tools/symbol-contract.ts:117:cba4  extractInterfaceSectionsFromSignature  function [untested]
src/tools/symbol-contract.ts:130:0fb1  pushInterfaceContractSections  function [leaf, untested]
```

**Verify**
- Output contains `### Methods`, not `### Takes`.
- Output lists the interface members from `src/graph/store.ts:30-49`.
- Trace shows the interface-section code is on the contract execution path.

**Verdict:** pass

### Criterion 2: `symbol_graph({ name: "GraphStatistics", include: ["contract"] })` renders the interface fields/types from the interface body.

**Identify**
- Run `symbol_graph` on `GraphStatistics` with `include:["contract"]`.
- Compare to `src/graph/store.ts`.

**Run / Read**

Command: `symbol_graph({ name:"GraphStatistics", file:"src/graph/store.ts", include:["contract"] })`

```text
## GraphStatistics (interface)
src/graph/store.ts:24:b453

### Signature
interface GraphStatistics

### Signals
[entry-point, leaf, untested]

## Contract: GraphStatistics
src/graph/store.ts:24:b453

### Fields
  nodes: Record<string, number>
  edges: Record<string, Record<string, number>>
  files: { total: number; stale: number }
```

Source of truth:

```text
src/graph/store.ts
24:db7|export interface GraphStatistics {
25:018|  nodes: Record<string, number>;
26:f5b|  edges: Record<string, Record<string, number>>;
27:5a8|  files: { total: number; stale: number };
28:b18|}
```

**Verify**
- Output contains `### Fields`.
- All three fields from `src/graph/store.ts:24-28` appear with their types.

**Verdict:** pass

### Criterion 3: Function contract rendering continues to pass existing contract tests; non-interface signature round-tripping is unchanged.

**Identify**
- Run the existing function-contract and signature round-trip tests fresh.
- Inspect the contract renderer to confirm interface handling is gated behind `node.kind === "interface"` and non-interface signatures still go through `parseSignatureParams`.

**Run / Read**

Fresh targeted tests:

```text
bun test test/tool-symbol-contract-happy.test.ts test/tool-symbol-contract-generic-sig.test.ts test/signature-round-trip.test.ts

6 pass
0 fail
34 expect() calls
Ran 6 tests across 3 files. [146.00ms]
```

Relevant code:

```text
src/tools/symbol-contract.ts
181:4c4|  if (node.kind === "interface" && node.signature) {
182:74d|    const fromSignature = extractInterfaceSectionsFromSignature(node.signature);
...
194:730|  if (interfaceSections) {
195:c81|    pushInterfaceContractSections(lines, interfaceSections);
196:524|  } else if (node.signature) {
197:40e|    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
198:22a|    if (sigParams.length > 0) {
```

Targeted tests asserting the pre-existing function path and signature storage:

```text
test/tool-symbol-contract-happy.test.ts
9:e82|test("symbolContract renders full contract with takes, returns, throws, guards, and test behaviors", () => {
...
60:d4e|    expect(output).toContain("### Takes");
61:6ff|    expect(output).toContain("input: string");
62:19e|    expect(output).toContain("### Returns");
63:75d|    expect(output).toContain("boolean");


test/tool-symbol-contract-generic-sig.test.ts
9:b61|test("symbolContract correctly parses signature with nested generic type params", () => {
...
33:d4e|    expect(output).toContain("### Takes");
36:19e|    expect(output).toContain("### Returns");


test/signature-round-trip.test.ts
5:2c7|test("signature round-trips through findNodes", () => {
...
22:bdb|  expect(found[0]!.signature).toBe("(x: string, y: number) => boolean");
29:515|test("signature round-trips through getNodesByFile", () => {
...
46:703|  expect(fileNodes[0]!.signature).toBe("class bar extends Base { constructor(name: string) }");
49:cf9|test("signature round-trips through getNeighbors", () => {
...
85:e74|  expect(neighbors[0]!.node.signature).toBe("(y: string) => boolean");
```

**Verify**
- Fresh targeted tests passed.
- Non-interface signatures still flow through the original `parseSignatureParams` path.
- Signature round-tripping remains intact for function/class neighbors and node lookups.

**Verdict:** pass

### Criterion 4: `resolveImplementations` only persists an `implements` edge when the class declaration actually implements the target interface; an in-class return-site/location like `src/graph/sqlite.ts:289:12` no longer creates a class-level `implements` edge.

**Identify**
- Run the repro test that injects an implementation location inside `getStatistics()` rather than on the class declaration.
- Inspect `resolveImplementations` and `classImplementsInterface` for the declaration-based guard.
- Use `trace` on `resolveImplementations` to confirm the guard is on the executed path.

**Run / Read**

Fresh repro test output:

```text
bun test test/repro-084-interface-handling.test.ts

(pass) repro #077: resolveImplementations should not add an implements edge from a return-site match [2.96ms]
```

Repro test setup and assertion:

```text
test/repro-084-interface-handling.test.ts
71:86a|test("repro #077: resolveImplementations should not add an implements edge from a return-site match", async () => {
...
90:107|    "export class SqliteGraphStore implements GraphStore {",
91:fc0|    "  getStatistics(): GraphStatistics {",
...
96:6b6|    "    return { nodes, edges, files: { total, stale } };",
...
114:220|      async implementations() {
115:8e6|        return [{ file: "src/sqlite.ts", line: 9, col: 12 }];
...
126:9b3|    await resolveImplementations(graphStatistics, store, projectRoot, client);
...
132:c21|    expect(implementsEdges).toHaveLength(0);
```

Guard in production code:

```text
src/indexer/lsp-resolver.ts
181:366|  for (const implLoc of impls) {
182:b68|    const implNode = store
183:123|      .getNodesByFile(implLoc.file)
184:32a|      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));
185:acd|    if (!implNode) continue;
186:2f0|    if (!classImplementsInterface(projectRoot, implNode.file, implNode.name, node.name, implNode.signature)) continue;
187:59d|    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
```

```text
src/indexer/lsp-resolver.ts
64:e15|function classImplementsInterface(
...
71:ed9|  if (signature != null) {
72:180|    return signatureImplementsInterface(signature, interfaceName);
73:b18|  }
...
77:a33|    const rx = new RegExp(
78:f48|      `\\bclass\\s+${escapeRegex(className)}\\b[^\\{]*\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`,
79:613|      "m",
80:82c|    );
81:1f0|    return rx.test(content);
```

Trace evidence:

```text
trace({ entry:"resolveImplementations", file:"src/indexer/lsp-resolver.ts" })
## Trust
status: heuristic
...
src/indexer/lsp-resolver.ts:138:e1d9  resolveImplementations  function [entry-point, untested]
...
src/indexer/lsp-resolver.ts:64:c58e  classImplementsInterface  function [untested]
...
src/indexer/lsp-resolver.ts:146:ce33  addFallbackImplementations  function [untested]
```

**Verify**
- The injected return-site location no longer creates an `implements` edge.
- Production code now rejects class-body containment alone and requires declaration/signature confirmation.

**Verdict:** pass

### Criterion 5: `symbol_graph("GraphStatistics")` no longer shows `SqliteGraphStore` under `Implemented By`, while `symbol_graph("GraphStore")` and existing positive implementation tests still show valid implementing classes.

**Identify**
- Run the real `symbol_graph` tool on the repo for both `GraphStore` and `GraphStatistics`.
- Run the existing positive LSP tests fresh.
- If behavior differs between a fresh store and the real tool, isolate that gap.

**Run / Read**

Actual tool output on the current repo for the positive half:

```text
symbol_graph({ name:"GraphStore", file:"src/graph/store.ts", include:["neighborhood"] })
## GraphStore (interface)
src/graph/store.ts:30:c121 [entry-point, leaf, untested]
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp [leaf, untested]
```

Actual tool output on the current repo for the negative half:

```text
symbol_graph({ name:"GraphStatistics", file:"src/graph/store.ts", include:["neighborhood"] })
## GraphStatistics (interface)
src/graph/store.ts:24:b453 [entry-point, leaf, untested]
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp [leaf, untested]
```

Fresh positive test run still passes:

```text
bun test test/tool-symbol-graph-lsp.test.ts
...
(pass) resolveImplementations persists implements edges and marker; second run skips implementations() [0.86ms]
(pass) tool path: interface symbol_graph resolves implementations, persists edge, and renders Implemented By section [291.23ms]
...
11 pass
0 fail
```

Fresh in-memory reindex reproduction (clean store, no persisted `.codegraph` state):

Command:
`bun --eval '... indexProject(...); resolveImplementations(... implementations(){return []} ...); console.log(symbolGraph(...GraphStore...)); console.log(symbolGraph(...GraphStatistics...));'`

Actual output:

```text
--- GraphStore fresh in-memory ---
## Trust
status: fresh
...
## GraphStore (interface)
src/graph/store.ts:30:c121 [entry-point, leaf, untested]
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp [leaf, untested]

--- GraphStatistics fresh in-memory ---
## Trust
status: fresh
...
## GraphStatistics (interface)
src/graph/store.ts:24:b453 [entry-point, leaf, untested]
```

Relevant early-return that explains why an already-persisted bad edge is not reconsidered:

```text
src/indexer/lsp-resolver.ts
144:719|  if (hasMarker(store, "implementations", node)) return;
145:35a|  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
```

And the original false-positive source line remains a return-site, not a class declaration:

```text
src/graph/sqlite.ts
261:0ca|  getStatistics(projectRoot?: string): GraphStatistics {
...
289:47f|    return { nodes, edges, files: { total, stale } };
```

**Verify**
- Positive half passes: `GraphStore` still shows `SqliteGraphStore` under `Implemented By`.
- Negative half fails in the real tool on the current repo: `GraphStatistics` **still** shows `SqliteGraphStore` under `Implemented By`.
- Clean-store reproduction shows the new write path is fixed; the remaining failure is persisted stale graph data / marker invalidation, not the fresh matching logic.

**Verdict:** fail

## Overall Verdict

fail

Summary:
- Criteria 1, 2, 3, and 4 passed with fresh evidence.
- Criterion 5 failed in the real `symbol_graph` tool on the current repo. The original false-positive `Implemented By` symptom is still user-visible for `GraphStatistics`.
- A clean in-memory reindex does not reproduce the false edge, which isolates the remaining gap to persisted `.codegraph` state: previously written bad `implements` edges and/or their resolver markers are not being invalidated or cleaned up.

Recommended next steps:
1. Add cleanup/revalidation for persisted `implements` edges created by older resolver logic.
2. Invalidate the `implementations` marker when interface/class signatures relevant to `implements` relationships change, or re-resolve and replace existing `implements` edges for interface reads.
3. Add a regression test for stale persisted false-positive `implements` edges so the real-tool behavior matches the clean-store behavior.
