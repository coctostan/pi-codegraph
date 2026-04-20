# Reproduction: interface contract output omits members and GraphStatistics gets a false `implements` edge

## Steps to Reproduce
1. Run:
   ```ts
   symbol_graph({ name: "GraphStore", file: "src/graph/store.ts", include: ["contract", "source"] })
   ```
2. Run:
   ```ts
   symbol_graph({ name: "GraphStatistics", file: "src/graph/store.ts", include: ["contract", "source"] })
   ```
3. Run:
   ```ts
   symbol_graph({ name: "GraphStatistics", file: "src/graph/store.ts", include: ["neighborhood"] })
   ```
4. Inspect the relevant source lines:
   - `src/graph/store.ts:24-30`
   - `src/graph/sqlite.ts:37-42`
   - `src/graph/sqlite.ts:289`
5. Inspect persisted graph data:
   ```sh
   sqlite3 .codegraph/graph.db "select id, kind, signature from nodes where id in ('src/graph/store.ts::GraphStatistics:24','src/graph/store.ts::GraphStore:30','src/graph/sqlite.ts::SqliteGraphStore:37');"
   sqlite3 .codegraph/graph.db "select e.source, e.target, e.kind, e.provenance_source, e.evidence from edges e where e.kind='implements' and e.target in ('src/graph/store.ts::GraphStatistics:24','src/graph/store.ts::GraphStore:30');"
   ```
6. Run the focused repro test:
   ```sh
   bun test test/repro-084-interface-handling.test.ts
   ```

## Expected Behavior
- `symbol_graph({ name: "GraphStore", include: ["contract"] })` should list interface method signatures.
- `symbol_graph({ name: "GraphStatistics", include: ["contract"] })` should list interface field types.
- `symbol_graph({ name: "GraphStatistics", include: ["neighborhood"] })` should not show an `Implemented By` section for `SqliteGraphStore`.
- `GraphStore` should still show `SqliteGraphStore` as an implementation.

## Actual Behavior
`GraphStore` contract output is nearly empty and only echoes the interface declaration:

```text
## GraphStore (interface)
src/graph/store.ts:30:c121

### Signature
interface GraphStore

### Signals
[entry-point, leaf, untested]

## Contract: GraphStore
src/graph/store.ts:30:c121

### Takes
  interface GraphStore
```

`GraphStatistics` shows the same problem:

```text
## GraphStatistics (interface)
src/graph/store.ts:24:b453

### Signature
interface GraphStatistics

### Signals
[entry-point, leaf, untested]

## Contract: GraphStatistics
src/graph/store.ts:24:b453

### Takes
  interface GraphStatistics
```

`GraphStatistics` also shows a false positive implementation edge:

```text
## GraphStatistics (interface)
src/graph/store.ts:24:b453 [entry-point, leaf, untested]
### Implemented By
  src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp [leaf, untested]
```

The focused repro test fails on both behaviors:

```text
bun test v1.3.11 (af24e281)

test/repro-084-interface-handling.test.ts:
39 |       store,
40 |       projectRoot,
41 |     });
42 |
43 |     expect(output).toContain("## Contract: GraphStore");
44 |     expect(output).toContain("### Methods");
                        ^
error: expect(received).toContain(expected)

Expected to contain: "### Methods"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/1\n## GraphStore (interface)\nsrc/store.ts:1:c121\n\n### Signature\ninterface GraphStore\n\n### Signals\n[entry-point, leaf, untested]\n\n## Contract: GraphStore\nsrc/store.ts:1:c121\n\n### Takes\n  interface GraphStore\n"

      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-084-interface-handling.test.ts:44:20)
(fail) repro #076: symbolGraph contract output for interfaces should list method signatures [19.91ms]
109 |
110 |     const implementsEdges = store
111 |       .getEdgesBySource(sqliteGraphStore.id)
112 |       .filter((edge) => edge.kind === "implements" && edge.target === graphStatistics.id && edge.provenance.source === "lsp");
113 |
114 |     expect(implementsEdges).toHaveLength(0);
                                  ^
error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 1

      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-084-interface-handling.test.ts:114:29)
(fail) repro #077: resolveImplementations should not add an implements edge from a return-site match [3.42ms]

 0 pass
 2 fail
 3 expect() calls
Ran 2 tests across 1 file. [150.00ms]
```

## Evidence
### Live source context
`src/graph/store.ts`:
```text
24:db7|export interface GraphStatistics {
25:018|  nodes: Record<string, number>;
26:f5b|  edges: Record<string, Record<string, number>>;
27:5a8|  files: { total: number; stale: number };
28:b18|}
29:d05|
30:89f|export interface GraphStore {
```

`src/graph/sqlite.ts` class declaration:
```text
37:c30|export class SqliteGraphStore implements GraphStore {
38:959|  private db: any;
39:d05|
40:7d4|  constructor(dbPath: string = ":memory:") {
41:dce|    this.db = openDb(dbPath);
42:377|    this.initSchema();
```

`src/graph/sqlite.ts` evidence line for the false positive edge:
```text
289:47f|    return { nodes, edges, files: { total, stale } };
```

`src/indexer/lsp-resolver.ts` stores any returned implementation location inside a class as an `implements` edge:
```text
168:366|  for (const implLoc of impls) {
169:b68|    const implNode = store
170:123|      .getNodesByFile(implLoc.file)
171:32a|      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));
172:d05|
173:acd|    if (!implNode) continue;
174:d05|
175:59d|    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
176:01e|    if (exists) continue;
177:62c|    store.addEdge({
178:03f|      source: implNode.id,
179:adc|      target: node.id,
180:b37|      kind: "implements",
181:639|      provenance: {
182:ca9|        source: "lsp",
183:606|        confidence: 0.9,
184:6f4|        evidence: `${implLoc.file}:${implLoc.line}:${implLoc.col}`,
185:2f1|        content_hash: implNode.content_hash,
186:2f6|      },
187:ed8|      created_at: Date.now(),
188:d86|    });
189:b18|  }
```

### Persisted graph data
Node signatures stored in `.codegraph/graph.db`:
```text
src/graph/sqlite.ts::SqliteGraphStore:37|class|class SqliteGraphStore implements GraphStore { constructor(dbPath: string) }
src/graph/store.ts::GraphStatistics:24|interface|interface GraphStatistics
src/graph/store.ts::GraphStore:30|interface|interface GraphStore
```

Persisted `implements` edges:
```text
src/graph/sqlite.ts::SqliteGraphStore:37|src/graph/store.ts::GraphStore:30|implements|lsp|src/graph/sqlite.ts:37:14
src/graph/sqlite.ts::SqliteGraphStore:37|src/graph/store.ts::GraphStatistics:24|implements|lsp|src/graph/sqlite.ts:289:12
```

The `GraphStore` edge points at the class declaration (`37:14`).
The `GraphStatistics` edge points at the `return { nodes, edges, files: ... }` line (`289:12`).

### Recent relevant changes
```text
801e702d feat: ship 061-m10-phase-3-demote-graph-query-graph-ove (#40)
289b1155 feat: ship 050-symbol-contract-tool-extract-behavioral- (#30)
e623f566 feat: ship 048-type-signature-extraction-from-tree-sitt (#28)
26a1c3ed feat(M2): LSP integration — tsserver client, eager index stage, lazy...
```

## Environment
- OS: `Darwin arm64`
- Bun: `1.3.11`
- Node: `v25.8.2`
- Package test runner: `bun test` (`package.json` → `"test": "bun test"`)
- Live graph status during repro: `status: fresh`, `stale-files: 0/183`

## Failing Test
Path: `test/repro-084-interface-handling.test.ts`

Contains two failing tests:
- `repro #076: symbolGraph contract output for interfaces should list method signatures`
- `repro #077: resolveImplementations should not add an implements edge from a return-site match`

Run with:
```sh
bun test test/repro-084-interface-handling.test.ts
```

## Reproducibility
Always
