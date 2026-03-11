# Reproduction: stale persisted graph data, inconsistent ambiguous-symbol handling, and `graph_query` equality parse failure

## Steps to Reproduce

### Issue #029 — stale persisted graph is not refreshed on tool invocation
1. Start in this repo with an existing persisted graph database at `.codegraph/graph.db`.
2. Invoke:
   - `symbol_graph(name: "GraphStore", file: "src/graph/store.ts")`
   - `trace(entry: "piCodegraph", file: "src/index.ts")`
3. Observe that both responses are marked `[stale]` and point at outdated anchor line numbers.
4. Compare those tool results to the current source files:
   - `src/graph/store.ts` currently declares `GraphStore` at line 30.
   - `src/index.ts` currently declares `piCodegraph` at line 101.
5. Run a clean-session reproduction in a temp project:
   - copy `src/` into a temp project root
   - invoke `symbol_graph(GraphStore)` and `trace(piCodegraph)` once to create `.codegraph/graph.db`
   - prepend three comment lines to `src/graph/store.ts` and `src/index.ts`
   - reset the extension singleton store and invoke the same tools again without deleting the DB
   - then delete the temp `.codegraph/graph.db`, reset the singleton again, and invoke the same tools a third time
6. Observe that the second run keeps using stale anchors from the persisted DB, while the third run (fresh DB) returns updated line numbers.

### Issue #030 — ambiguous symbol handling differs across tools
1. Invoke `symbol_graph(name: "sha256Hex")`.
2. Invoke `resolve_edge(source: "sha256Hex", target: "computeAnchor", kind: "calls", evidence: "repro")`.
3. Invoke `trace(entry: "sha256Hex")`.
4. Invoke `impact(symbols: ["sha256Hex"], changeType: "signature_change")`.
5. Compare the responses.

### Issue #031 — `graph_query` rejects basic equality predicates
1. Invoke `graph_query(query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name")`.
2. As a control, invoke `graph_query(query: "MATCH (n)-[e]->(m) RETURN n.name, e.kind, m.name LIMIT 10")`.
3. Compare the responses.

## Expected Behavior

### Issue #029
Tool invocation should reflect the current source tree, not stale persisted graph state. When the source has changed since the DB was built, a tool call should refresh or otherwise return current anchors.

### Issue #030
All tools that accept a symbol name should handle ambiguity consistently. If a symbol name is ambiguous, the tool should either disambiguate explicitly or clearly document multi-match behavior.

### Issue #031
A Cypher-like `WHERE` equality predicate such as `n.name = 'GraphStore'` should either work or be rejected with a contract that makes the restriction explicit up front.

## Actual Behavior

### Issue #029
Current repo tool calls return stale anchors:

```text
## GraphStore (interface)
src/graph/store.ts:13:d1a0 [stale]

### Implementations
  src/graph/sqlite.ts:36:db54  SqliteGraphStore  implements  confidence:0.9  lsp
```

```text
mode: static
src/index.ts:71:712e  piCodegraph  function [stale]
src/index.ts:39:277c  getOrCreateStore  function [stale]
src/graph/sqlite.ts:36:db54  SqliteGraphStore  class [stale]
```

But the current files are now at:
- `src/graph/store.ts:30` → `export interface GraphStore {`
- `src/index.ts:101` → `export default function piCodegraph(pi: ExtensionAPI): void {`

Clean-session temp repro:

```text
=== initial index: symbol_graph ===
## GraphStore (interface)
src/graph/store.ts:30:c121

### Implementations
  src/graph/sqlite.ts:35:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp

=== initial index: trace ===
mode: static
src/index.ts:101:07cd  piCodegraph  function
src/index.ts:69:6c9d  getOrCreateStore  function
src/graph/sqlite.ts:35:9c6d  SqliteGraphStore  class

=== stale db after source change: symbol_graph ===
## GraphStore (interface)
src/graph/store.ts:30:430e [stale]

### Implementations
  src/graph/sqlite.ts:35:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp

=== stale db after source change: trace ===
mode: static
src/index.ts:101:b0a3  piCodegraph  function [stale]
src/index.ts:69:f171  getOrCreateStore  function [stale]
src/graph/sqlite.ts:35:9c6d  SqliteGraphStore  class

=== fresh db after deleting stale graph: symbol_graph ===
## GraphStore (interface)
src/graph/store.ts:33:c121

### Implementations
  src/graph/sqlite.ts:35:9c6d  SqliteGraphStore  implements  confidence:0.9  lsp

=== fresh db after deleting stale graph: trace ===
mode: static
src/index.ts:104:07cd  piCodegraph  function
src/index.ts:72:6c9d  getOrCreateStore  function
src/graph/sqlite.ts:35:9c6d  SqliteGraphStore  class
```

### Issue #030
The same ambiguous symbol name produces different behaviors across tools:

```text
Multiple matches for "sha256Hex":

  src/indexer/tree-sitter.ts:15:a732  sha256Hex (function)  src/indexer/tree-sitter.ts [stale]
  src/output/anchoring.ts:12:64ba  sha256Hex (function)  src/output/anchoring.ts
  test/indexer-index-project.test.ts:12:b885  sha256Hex (function)  test/indexer-index-project.test.ts [stale]
  test/output-compute-anchor.test.ts:8:64ba  sha256Hex (function)  test/output-compute-anchor.test.ts
```

```text
Ambiguous source — multiple matches:
  src/indexer/tree-sitter.ts  function  line 15
  src/output/anchoring.ts  function  line 12
  test/indexer-index-project.test.ts  function  line 12
  test/output-compute-anchor.test.ts  function  line 8

Specify sourceFile to disambiguate.
```

```text
Entry "sha256Hex" not found
```

```text
src/indexer/pipeline.ts:48:e3b0  indexProject  breaking  depth:1 [stale]
src/indexer/tree-sitter.ts:60:26fe  extractFile  breaking  depth:1 [stale]
src/output/anchoring.ts:16:0d83  computeAnchor  breaking  depth:1
src/index.ts:47:2957  ensureIndexed  behavioral  depth:2 [stale]
src/index.ts:53:e3b0  renderImplementationsSuffix  behavioral  depth:2 [stale]
src/tools/resolve-edge.ts:40:11e5  resolveEdge  behavioral  depth:2
src/tools/symbol-graph.ts:53:288e  symbolGraph  behavioral  depth:2
src/tools/symbol-graph.ts:27:5a6b  toAnchoredNeighbor  behavioral  depth:2
src/index.ts:71:712e  piCodegraph  behavioral  depth:3 [stale]
src/tools/symbol-graph.ts:40:2ede  buildSection  behavioral  depth:3
```

### Issue #031
Equality predicate query fails:

```text
parse_error: invalid WHERE predicate: n.name = 'GraphStore'
```

Control query succeeds:

```text
rows: 10
row 1
  n.name: __meta__::resolver::implementations::src/graph/store.ts::GraphStore:13
  e.kind: imports
  m.name: GraphStore
row 2
  n.name: SqliteGraphStore
  e.kind: implements
  m.name: GraphStore
row 3
  n.name: ensureIndexed
  e.kind: calls
  m.name: indexProject
row 4
  n.name: getOrCreateStore
  e.kind: calls
  m.name: SqliteGraphStore
row 5
  n.name: piCodegraph
  e.kind: calls
  m.name: ensureIndexed
row 6
  n.name: piCodegraph
  e.kind: calls
  m.name: getOrCreateStore
row 7
  n.name: piCodegraph
  e.kind: calls
  m.name: renderImplementationsSuffix
row 8
  n.name: piCodegraph
  e.kind: calls
  m.name: resolveImplementations
row 9
  n.name: piCodegraph
  e.kind: calls
  m.name: resolveMissingCallers
row 10
  n.name: piCodegraph
  e.kind: calls
  m.name: TsServerClient
```

## Evidence
- Existing persisted DB present before reproduction: `.codegraph/graph.db`
- Current file anchors from source reads:
  - `src/graph/store.ts:30` → `export interface GraphStore {`
  - `src/index.ts:101` → `export default function piCodegraph(pi: ExtensionAPI): void {`
- Tool outputs above show stale results still anchored at old line numbers in the current repo.
- Temp-project clean-session repro shows:
  - first index returns fresh anchors
  - changing source without deleting the DB yields `[stale]` anchors at the old lines
  - deleting the DB and invoking again yields updated anchors
- Recent relevant history checked during reproduction:
  - `1c2bb956 feat(M5): graph_query tool — Cypher subset to parameterized SQL (#02...`
  - `ed0925cb feat(m4): V8 coverage indexer and trace tool (#6)`
  - `45765877 feat(M5): git co-change stage, tree-sitter hardening, pipeline timin...`

## Environment
- OS: `Darwin 25.3.0 arm64`
- Bun: `1.3.9`
- Node: `v25.6.1`
- Language/runtime: TypeScript + Bun
- Test runner from `package.json`: `bun test`
- Repo: `/Users/maxwellnewman/pi/workspace/pi-codegraph`

## Failing Test
Not added yet because this batch reproduction covers three separate tool regressions, and the stale-DB case needs a persisted graph plus a fresh extension session to be faithful. Focused regression tests should be added per issue during implement:
- one temp-project persisted-DB test for stale auto-refresh
- one ambiguity-consistency test covering `symbol_graph` / `trace` / `impact`
- one `graph_query` parser test for `WHERE n.name = 'GraphStore'`

## Reproducibility
- Issue #029: Always, when a persisted `.codegraph/graph.db` exists and the indexed source has changed since that DB was built.
- Issue #030: Always, for the ambiguous symbol name `sha256Hex` in this repo.
- Issue #031: Always, for `graph_query(query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name")`.
