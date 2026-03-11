# Diagnosis

## Root Cause

This batch issue contains three independent root causes in adjacent tooling code:

1. **Stale persisted graph is never refreshed once any file hashes exist.**
   In `src/index.ts`, `ensureIndexed()` only calls `indexProject()` when `store.listFiles().length === 0` (`src/index.ts:77-81`). That means a non-empty persisted `.codegraph/graph.db` is treated as valid even when tracked source files have changed. The stored nodes keep old `start_line` values, and later rendering only marks them stale via `computeAnchor()` instead of re-indexing. Evidence:
   - `indexProject()` already knows how to detect changed files by comparing `store.getFileHash(rel)` to the current SHA-256 and re-indexing when they differ (`src/indexer/pipeline.ts:73-89`).
   - `SqliteGraphStore.getStatistics(projectRoot)` already computes stale-file counts by hashing current files and comparing to stored hashes (`src/graph/sqlite.ts:210-239`).
   - Real reproduction showed stale anchors persisted until the DB was deleted; after deleting the DB, the same calls returned updated lines.

2. **Ambiguous symbol handling is implemented in some tools but absent/inconsistent in others.**
   The code paths do not share a common symbol-resolution contract.
   - `symbol_graph` explicitly distinguishes `0`, `1`, and `>1` matches and renders a disambiguation list (`src/tools/symbol-graph.ts:56-70`).
   - `resolve_edge` also distinguishes ambiguity and returns `Specify sourceFile/targetFile to disambiguate` (`src/tools/resolve-edge.ts:43-59`).
   - `trace` uses a private `resolveNode()` helper that returns `null` for anything other than exactly one match: `if (matches.length !== 1) return null;` (`src/tools/trace.ts:11-15`). The caller then collapses both zero matches and ambiguous matches into the same message: `Entry "..." not found` (`src/tools/trace.ts:78-80`).
   - `impact` does the opposite: it iterates every node returned by `store.findNodes(symbol)` and enqueues them all (`src/tools/impact.ts:39-44`), silently broadening the analysis across all matching symbols.
   Evidence from reproduction matches these code paths exactly: `symbol_graph` disambiguates, `resolve_edge` disambiguates, `trace` reports not found, and `impact` returns an aggregated result.

3. **`graph_query` supports equality predicates, but only with double-quoted string literals; the failing query used single quotes.**
   The parser accepts `WHERE` predicates only if they match this exact regex in `parseWhere()`: `alias.property = "value"` (`src/tools/graph-query-parser.ts:153-160`). Single-quoted strings are rejected as `parse_error: invalid WHERE predicate ...`. This is confirmed by a control check during diagnosis:
   - Failing repro: `MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name` → `parse_error: invalid WHERE predicate: n.name = 'GraphStore'`
   - Minimal confirmation: `MATCH (n) WHERE n.name = "GraphStore" RETURN n.name` succeeds and returns one row.
   So the root cause is not that equality `WHERE` is unsupported in general; it is that the parser's accepted literal syntax is narrower than the Cypher-like interface suggests.

## Trace

### Issue #029 — stale persisted graph
1. Symptom: tool output shows current-file anchors marked `[stale]` with outdated line numbers.
2. Those anchors are produced by `computeAnchor(node, projectRoot)` in `src/output/anchoring.ts:16-47`.
3. `computeAnchor()` does **not** repair stale data; it uses the node's stored `start_line` and only compares current file hash to `node.content_hash` to set `stale=true`.
4. Therefore the stale `start_line` must already be present in the node loaded from the graph store.
5. Tool entrypoints call `ensureIndexed(projectRoot, store)` before querying (`src/index.ts:107-110`, `162-166`, `182-186`, `196-200`).
6. `ensureIndexed()` only indexes when `store.listFiles().length === 0` (`src/index.ts:77-81`). If the DB already has any file hashes, no refresh happens.
7. `indexProject()` contains the actual change-detection logic (`src/indexer/pipeline.ts:73-89`), but that logic is bypassed unless the DB is empty.
8. Therefore the point where correct becomes incorrect is the gating condition in `ensureIndexed()`: it equates “non-empty DB” with “up-to-date index”.

### Issue #030 — ambiguous symbols
1. Symptom: the same ambiguous name `sha256Hex` yields three different semantic outcomes across tools.
2. All of these tools ultimately resolve symbols via `store.findNodes(name, file?)`.
3. `symbol_graph` handles `nodes.length > 1` explicitly and returns a multi-match list (`src/tools/symbol-graph.ts:62-69`).
4. `resolve_edge` handles `sourceNodes.length > 1` / `targetNodes.length > 1` explicitly and asks for `sourceFile` / `targetFile` (`src/tools/resolve-edge.ts:48-59`).
5. `trace` funnels `store.findNodes()` through `resolveNode()`, where any match count other than 1 becomes `null` (`src/tools/trace.ts:11-15`), then reports `Entry "..." not found` (`src/tools/trace.ts:78-80`).
6. `impact` does no ambiguity check at all; it seeds traversal from every match (`src/tools/impact.ts:39-44`).
7. Therefore the source of inconsistency is not the store; it is per-tool resolution logic with incompatible assumptions about what multiple matches mean.

### Issue #031 — `graph_query` equality failure
1. Symptom: `graph_query` rejects `WHERE n.name = 'GraphStore'`.
2. `graphQuery()` delegates to `parseGraphQuery()` and returns parser errors directly (`src/tools/graph-query.ts:18-30`).
3. `parseGraphQuery()` delegates `WHERE` handling to `parseWhere()` (`src/tools/graph-query-parser.ts:236-248`, `146-162`).
4. `parseWhere()` only matches predicates whose RHS is a **double-quoted** string (`src/tools/graph-query-parser.ts:154`).
5. The compiler itself supports equality predicates and compiles them to `tableAlias.property = ?` (`src/tools/graph-query-compiler.ts:85-89`).
6. A minimal diagnostic check confirmed that changing only the quotes to double quotes makes the query work.
7. Therefore the point where correct becomes incorrect is parser tokenization/validation of string literals, not SQL compilation or graph execution.

## Affected Code

- `src/index.ts`
  - `ensureIndexed()` (`77-81`)
  - tool entrypoints calling `ensureIndexed()` (`107-110`, `141-143`, `164-166`, `184-186`, `198-200`)
- `src/indexer/pipeline.ts`
  - `indexProject()` change detection (`73-89`)
- `src/graph/sqlite.ts`
  - `getStatistics(projectRoot)` stale-file detection (`210-239`)
  - `findNodes()` (`113-119`)
- `src/output/anchoring.ts`
  - `computeAnchor()` stale-marker behavior (`16-47`)
- `src/tools/symbol-graph.ts`
  - ambiguity handling (`56-70`)
- `src/tools/resolve-edge.ts`
  - source/target ambiguity handling (`43-59`)
- `src/tools/trace.ts`
  - `resolveNode()` ambiguity collapse (`11-15`)
  - `trace()` not-found message (`78-80`)
- `src/tools/impact.ts`
  - silent multi-match aggregation (`39-44`)
- `src/tools/graph-query.ts`
  - parser error surfacing (`18-30`)
- `src/tools/graph-query-parser.ts`
  - `parseWhere()` double-quote-only regex (`153-160`)
- `src/tools/graph-query-compiler.ts`
  - confirms equality predicates are otherwise supported (`85-89`)

## Pattern Analysis

### Working vs broken for stale indexing
- **Working code path:** `indexProject()` compares current file hash to stored file hash and re-indexes changed files (`src/indexer/pipeline.ts:73-89`). `getStatistics(projectRoot)` also detects stale tracked files by recomputing hashes (`src/graph/sqlite.ts:225-235`).
- **Broken code path:** `ensureIndexed()` does not call either of those checks when the DB is non-empty; it only checks emptiness (`src/index.ts:77-81`).
- **Violated assumption:** “If the store has any indexed files, it is current enough to use.” This assumption is false for persisted session reuse.

### Working vs broken for ambiguous symbols
- **Working pattern:** `symbol_graph` and `resolve_edge` treat `>1` matches as a first-class state and report ambiguity explicitly.
- **Broken patterns:**
  - `trace` assumes anything other than one match is equivalent to not found.
  - `impact` assumes multiple matches should all be included.
- **Violated assumption:** each tool encodes its own meaning for `findNodes(name)` results instead of sharing one contract.
- **Additional evidence of structural gap:** tests exist for `symbol_graph` ambiguity (`test/tool-symbol-graph.test.ts:109-120`) and `resolve_edge` ambiguity (`test/tool-resolve-edge.test.ts` via grep), but no ambiguity-focused tests were found for `trace` or `impact`.

### Working vs broken for `graph_query`
- **Working pattern:** parser tests use double-quoted strings everywhere, e.g. `WHERE a.name = "foo"` (`test/graph-query-parser.test.ts:4-22`), and compiled equality predicates work.
- **Broken case:** user-facing Cypher-like query with single quotes is rejected by the parser.
- **Violated assumption:** the interface says “Cypher subset”, which strongly suggests single-quoted string literals should parse, but implementation only accepts a JSON-like double-quoted subset.

## Risk Assessment

- Changing stale-index behavior affects **all five tools**, because each tool entrypoint calls `ensureIndexed()` before reading the store. Any refresh-policy change could alter tool latency and when LSP/coverage/git stages run.
- Refreshing stale files may affect agent-authored edges and trace data because `indexProject()` deletes file-derived nodes/edges for changed files (`src/indexer/pipeline.ts:80-82`, `src/graph/sqlite.ts:182-194`). Care is needed around provenance preservation and incremental stages.
- Unifying ambiguity handling affects externally visible tool contracts for `trace` and `impact`, and may change downstream agent workflows that currently rely on “not found” or blended impact behavior.
- Expanding `graph_query` literal parsing risks changing parser behavior beyond the failing case; the parser/compiler tests will need to preserve current validation boundaries (no mutating queries, no OR, no aggregation, etc.).
- Related bug surface: any other tool that calls `store.findNodes()` directly without a shared resolver is a candidate for the same ambiguity inconsistency.

## Fixed When
1. Tool invocation no longer relies on `store.listFiles().length === 0` as the only indexing gate; persisted stale graphs are detected before serving results.
2. With an existing stale `.codegraph/graph.db`, invoking `symbol_graph` or `trace` returns anchors for the current source state rather than stale old line numbers.
3. Ambiguous symbol names are handled consistently across `symbol_graph`, `resolve_edge`, `trace`, and `impact`, with explicit semantics for the multi-match case.
4. `graph_query(query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name")` either succeeds or the public contract is narrowed so the quote restriction is explicit and tested.
5. Regression tests cover:
   - persisted stale DB refresh behavior,
   - ambiguity handling for `trace` and `impact`,
   - single-quoted `WHERE` equality parsing for `graph_query`.
