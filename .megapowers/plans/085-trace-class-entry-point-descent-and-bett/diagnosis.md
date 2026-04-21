# Diagnosis

## Root Cause
Confirmed root cause claim: this batch issue is caused by **two separate trace-specific design mismatches**, both confirmed in code and by direct execution.

1. **Class trace bug (#079): the indexed graph does not represent class behavior as traceable nodes/edges, and `trace` only walks outgoing `calls` edges.**
   - `trace()` resolves the entry, then in static mode calls `buildStaticTrace(params.store, node.id)` and formats the returned node IDs directly: `src/tools/trace.ts:103-136`.
   - `buildStaticTrace()` does a DFS over **only** `store.getNeighbors(currentId, { direction: "out", kind: "calls" })`: `src/tools/trace.ts:38-60`.
   - `extractFile()` creates a node for a `class_declaration`, but only a single class node: `src/indexer/tree-sitter.ts:253-268`.
   - `visitCalls()` only assigns a `nextFunctionId` for `function_declaration` and arrow-function `variable_declarator` nodes, never for `method_definition` / constructors inside classes: `src/indexer/tree-sitter.ts:443-458`.
   - Because the method body never gets its own `nextFunctionId`, calls inside class methods are never emitted as `calls` edges from a class method or class entry: `src/indexer/tree-sitter.ts:461-513`.
   - `createSignalComputer()` then labels any node with `fanOut === 0` as `leaf`, which is why the class shows up as `[leaf]`: `src/output/signals.ts:137-147`.
   - Direct execution during diagnosis confirmed the graph loss happens at extraction time, before `trace()` formats anything:
     ```json
     {
       "nodes": [
         {
           "kind": "class",
           "name": "SqliteGraphStore",
           "file": "src/store.ts"
         }
       ],
       "edges": []
     }
     ```
     for the repro fixture class:
     ```ts
     export class SqliteGraphStore {
       constructor() {}
       getNode() { return 1; }
       findNodes() { return 2; }
     }
     ```
   - A second direct check on real repo files showed the same pattern:
     - `src/graph/sqlite.ts` extraction produced `class:SqliteGraphStore` but **no edges from that class node**.
     - `src/tools/bm25.ts` extraction produced `class:BM25Index` but **no method nodes** (`addDocument`, `build`, `search` are absent as graph nodes).
   - Therefore the point where correct source structure becomes incorrect graph data is **`extractFile()` / `visitCalls()`**, and `trace()` is faithfully traversing an under-modeled graph.

2. **Not-found messaging bug (#080): `trace` delegates lookup to a generic resolver that collapses every zero-match case into the same `not_found` result, then labels it as an `Entry`.**
   - `trace()` calls `resolveUniqueSymbol()` with `notFoundLabel: "Entry"` and immediately returns `resolved.text` for both `not_found` and `ambiguous`: `src/tools/trace.ts:104-115`.
   - `resolveUniqueSymbol()` performs exactly one lookup: `params.store.findNodes(params.name, params.file)`: `src/tools/symbol-resolution.ts:20-34`.
   - If that filtered lookup returns zero rows, the resolver immediately returns `kind: "not_found"` with generic text `${notFoundLabel} "${name}" not found`: `src/tools/symbol-resolution.ts:27-30`.
   - `SqliteGraphStore.findNodes()` applies the file filter as an exact `WHERE name = ? AND file = ?`: `src/graph/sqlite.ts:140-146`.
   - Direct execution during diagnosis confirmed the missing distinction:
     ```text
     findNodes("walk", "src/does-not-exist.ts") => []
     findNodes("walk") => [src/walk.ts::walk:1]
     ```
     Yet `trace({ entry: "walk", file: "src/does-not-exist.ts" })` still returns:
     ```text
     Entry "walk" not found
     ```
   - So the point where correct lookup state becomes incorrect user-facing output is **`resolveUniqueSymbol()` collapsing all zero filtered matches into a single `not_found` state**, combined with `trace()` choosing the misleading label `Entry` and not doing any secondary unfiltered lookup.

## Trace
### #079 Class entry path
1. Symptom appears in final `trace()` output as a single class line marked `[leaf]`.
2. `trace()` resolves the class node and, with no coverage trace, falls back to `buildStaticTrace()`: `src/tools/trace.ts:117-136`.
3. `buildStaticTrace()` only follows outgoing `calls` edges: `src/tools/trace.ts:48-57`.
4. For the class entry node, `store.getNeighbors(classId, { direction: "out", kind: "calls" })` is empty.
5. That emptiness comes from indexing, not formatting:
   - `extractFile()` adds one class node for `class_declaration`: `src/indexer/tree-sitter.ts:253-268`.
   - `visitCalls()` never establishes class methods as call-owning scopes, because it only recognizes top-level functions and arrow functions: `src/indexer/tree-sitter.ts:446-458`.
6. Therefore the exact point where correct becomes incorrect is the tree-sitter indexing rule set: **class bodies with behavior are stored as atomic class nodes without behavioral descendants or outgoing call edges**.
7. `createSignalComputer()` then derives `[leaf]` from `fanOut === 0`, which is a downstream symptom, not the root cause: `src/output/signals.ts:137-147`.

### #080 Not-found / file-filter-miss path
1. Symptom appears in final `trace()` output as `Entry "..." not found` for both a truly missing symbol and a file-filter miss.
2. `trace()` does not perform lookup logic itself; it delegates to `resolveUniqueSymbol()` and returns its text verbatim on `not_found`: `src/tools/trace.ts:104-115`.
3. `resolveUniqueSymbol()` performs only the filtered lookup `store.findNodes(name, file)`: `src/tools/symbol-resolution.ts:27`.
4. `findNodes()` treats the file filter as exact match SQL, so a wrong file path returns zero results even when the symbol exists elsewhere: `src/graph/sqlite.ts:140-146`.
5. The resolver does not retry without the file filter and does not surface candidate locations when the unfiltered name exists.
6. `trace()` also passes `notFoundLabel: "Entry"`, which makes the already-collapsed result misleading.
7. Therefore the exact point where correct becomes incorrect is the resolver contract itself: **zero filtered matches ⇒ one undifferentiated `not_found` result string**.

## Affected Code
- `src/tools/trace.ts:103-136` — tool entry; returns resolver text directly and falls back to static DFS.
- `src/tools/trace.ts:38-60` — `buildStaticTrace()` traverses only outgoing `calls` edges.
- `src/output/signals.ts:137-147` — `leaf` role is derived purely from `fanOut === 0`.
- `src/indexer/tree-sitter.ts:253-268` — `extractFile()` creates a single node for each class declaration.
- `src/indexer/tree-sitter.ts:443-513` — `visitCalls()` scopes call extraction only to functions/arrows, not class methods.
- `src/indexer/tree-sitter.ts:130-159` — `extractClassSignature()` inspects constructor syntax only for signature text; it does not create method nodes.
- `src/indexer/lsp.ts:38-94` — LSP stage upgrades/resolves edges, but does not create missing class-method nodes.
- `src/tools/symbol-resolution.ts:20-34` — `resolveUniqueSymbol()` conflates all zero-match cases.
- `src/graph/sqlite.ts:140-146` — `findNodes()` applies exact optional file filtering.
- `src/indexer/pipeline.ts:84-88` — `indexProject()` persists whatever `extractFile()` extracted, so the class-modeling bug propagates to the whole graph.
- `src/tools/impact.ts:188-195` — working comparison: the same resolver is used here with `notFoundLabel: "Symbol"`, showing the misleading `Entry` label is chosen by `trace`, not by storage.

## Pattern Analysis
### Working vs broken trace graph shape
- **Working pattern:** top-level functions are indexed as function nodes, and `visitCalls()` assigns them a source ID for outgoing `calls` edges.
  - Example: `src/indexer/pipeline.ts` adds `indexProject` as a `function` node, and direct extraction during diagnosis showed many `calls` edges from `src/indexer/pipeline.ts::indexProject:53`.
  - That is why `trace({ entry: "indexProject", file: "src/indexer/pipeline.ts" })` descends normally.
- **Broken pattern:** classes are indexed as a single `class` node, but methods are not emitted as nodes and are not used as call scopes.
  - Repro fixture extraction returned one `class` node and zero edges.
  - Real-file extraction for `src/tools/bm25.ts` returned `class:BM25Index` but no `addDocument` / `build` / `search` nodes.
- **Key difference:** function declarations become behavioral graph roots; class methods do not.
- **Violated assumption:** `trace` assumes every resolvable entry has useful outgoing `calls` edges. That assumption holds for indexed functions, but not for classes under the current extractor.

### Working vs broken symbol-resolution behavior
- **Working pattern:** ambiguity is preserved.
  - `resolveUniqueSymbol()` has a dedicated `nodes.length > 1` branch that renders candidate locations.
  - Existing control test `test/tool-trace-ambiguous.test.ts` passes, and `trace({ entry: "walk" })` shows the expected multi-match list.
- **Broken pattern:** all zero-match outcomes are flattened.
  - Truly missing symbol: `trace({ entry: "runPipeline" })` → `Entry "runPipeline" not found`.
  - Existing symbol + wrong file filter: `trace({ entry: "walk", file: "src/does-not-exist.ts" })` → the same `Entry "walk" not found`.
- **Key difference:** ambiguity keeps structural information; zero matches discard it.
- **Violated assumption:** `store.findNodes(name, file)` returning `[]` is assumed to mean “symbol absent,” but the direct probe above shows it can also mean “symbol exists, file filter missed.”

### Working wording elsewhere
- `impact()` calls `resolveUniqueSymbol()` with `notFoundLabel: "Symbol"`: `src/tools/impact.ts:188-195`.
- `symbolCard()` also reports `Symbol "..." not found`: `src/tools/symbol-card.ts:123-138`.
- `trace()` is the outlier because it passes `Entry`, even though the failing repros are ordinary symbol lookups, not architectural entry-point validation.

## Risk Assessment
- Changing class handling in `extractFile()` affects the indexing pipeline through `extractFile` → `indexProject` → persisted graph contents for all tools.
  - Any fix that starts emitting method-level nodes/edges can change `trace`, `symbol_graph`, `impact`, and signal calculations for class-heavy files.
- Changing `trace()` behavior affects the extension surface exposed by `piCodegraph`.
  - `impact(["trace", "resolveUniqueSymbol", "extractFile"], "behavior_change")` shows immediate dependents include `src/index.ts:199` (`piCodegraph`) and `src/tools/impact.ts:161` (`impact`), plus extension-level tests.
- Changing `resolveUniqueSymbol()` is riskier than changing only `trace()`, because `impact()` also consumes it.
- Main regression areas if this is fixed:
  1. function traces like `indexProject` must remain unchanged
  2. ambiguity output like `trace("walk")` must remain unchanged
  3. any class-aware handling must avoid introducing infinite traversal or misleading synthetic edges
  4. if the fix touches signal computation, non-trace tools that show `[leaf]` / `[entry-point]` tags may change too
- Related bugs likely share these causes:
  - any other class symbol with methods but no class-level `calls` edges will currently trace as a leaf
  - any other tool that relies on a single filtered `findNodes(name, file)` lookup through `resolveUniqueSymbol()` can conflate “wrong file filter” with “symbol absent” unless it performs a second lookup

## Fixed When
1. `trace({ entry: "SqliteGraphStore" })` and `trace({ entry: "BM25Index", file: "src/tools/bm25.ts" })` no longer stop at a bare class node marked as `[leaf]`; they either descend into class behavior or emit an explicit class-specific redirect/note.
2. `trace({ entry: "indexProject", file: "src/indexer/pipeline.ts" })` still returns the current normal multi-node trace.
3. A truly missing lookup is labeled as a symbol lookup failure, e.g. `Symbol "runPipeline" not found`.
4. A file-filter miss surfaces the real candidate location(s), e.g. `trace({ entry: "walk", file: "src/does-not-exist.ts" })` mentions `src/walk.ts` rather than returning the generic not-found string.
5. Existing ambiguity behavior remains unchanged: `trace({ entry: "walk" })` still returns the multi-match disambiguation list.
