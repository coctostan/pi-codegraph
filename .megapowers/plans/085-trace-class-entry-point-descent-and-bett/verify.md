## Test Suite Results

**Project convention evidence**
- `AGENTS.md:67` — `Bun runtime, TypeScript`
- Test runner verified by fresh commands below: `bun test ...`

**Impact check on changed symbol (`trace`) before concluding coverage**
```text
indexing-failed (0s ago): Bun is not defined
No dependents found — 'trace' is an entry point with no callers.
```
`impact` surfaced no downstream dependents to map to tests. A direct `symbol_graph` on `trace` also showed only **Callees** and no **Callers**, and the full suite still ran the trace-specific regressions listed below.

**Feature-path evidence (`trace` is on the executed path)**
```text
## trace (function)
src/tools/trace.ts:127:29b4

### Key Relationships
  Callees (10):  resolveUniqueSymbol, computeAnchor, formatFileScopedMiss, createSignalComputer, resolveCoverageTraceId (+5 more)
```

**Fresh full suite**
```text
test/repro-080-trace-not-found-message.test.ts:
(pass) trace labels a missing entry as a symbol lookup failure [2.02ms]
(pass) trace suggests the real symbol location when the file filter misses [1.53ms]

...

test/tool-trace-ambiguous.test.ts:
(pass) trace returns a disambiguation list when entry matches multiple symbols [1.26ms]

...

test/repro-079-trace-class-entry-point.test.ts:
(pass) trace does not stop at a class entry point that has methods [1.39ms]

...

test/tool-trace-static-cycle.test.ts:
(pass) trace static DFS terminates on recursive call cycles and includes all reachable nodes once [1.81ms]

...

test/tool-trace-static-fallback.test.ts:
(pass) trace falls back to a deterministic static call path when no coverage trace exists [1.55ms]

 404 pass
 0 fail
 1174 expect() calls
Ran 404 tests across 164 files. [12.05s]
EXIT:0
```

**Focused regressions**
```text
$ bun test test/repro-079-trace-class-entry-point.test.ts test/tool-trace-static-cycle.test.ts
(pass) trace does not stop at a class entry point that has methods
(pass) trace static DFS terminates on recursive call cycles and includes all reachable nodes once
2 pass
0 fail

$ bun test test/tool-trace-static-fallback.test.ts
(pass) trace falls back to a deterministic static call path when no coverage trace exists
1 pass
0 fail

$ bun test test/repro-080-trace-not-found-message.test.ts test/tool-trace-ambiguous.test.ts
(pass) trace labels a missing entry as a symbol lookup failure
(pass) trace suggests the real symbol location when the file filter misses
(pass) trace returns a disambiguation list when entry matches multiple symbols
3 pass
0 fail
```

## Bug Reproduction Results

Direct reproduction of the original diagnosis scenarios no longer shows the old symptom:

```text
--- trace(SqliteGraphStore, file=src/store.ts) ---
## Trust
status: heuristic
evidence: none  stale-files: 0/0
mode: static (heuristic, no runtime evidence)
src/store.ts:1:3f9c  SqliteGraphStore  class [entry-point, untested]
  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available

--- trace(runPipeline) ---
## Trust
status: fresh
evidence: none  stale-files: 0/0
Symbol "runPipeline" not found in the graph

--- trace(walk, file=src/does-not-exist.ts) ---
## Trust
status: fresh
evidence: none  stale-files: 0/0
Symbol "walk" was not found in src/does-not-exist.ts. Matches exist in other files:

  src/walk.ts:1:673a  walk (function)  src/walk.ts
```

## Per-Criterion Verification

### Criterion 1: `trace({ entry: "SqliteGraphStore" })` and `trace({ entry: "BM25Index", file: "src/tools/bm25.ts" })` no longer stop at a bare class node marked as `[leaf]`; they either descend into class behavior or emit an explicit class-specific redirect/note.

**Identify**
- Repo-registered `trace` tool output for `SqliteGraphStore` and `BM25Index`
- `ast_search` confirming both symbols are class declarations
- `symbol_graph` confirming both class symbols exist at the expected files
- `read(src/tools/trace.ts, symbol: "trace")` confirming the class-specific branch in shipped source
- Focused regression tests: `test/repro-079-trace-class-entry-point.test.ts` and `test/tool-trace-static-cycle.test.ts`

**Evidence**

Structural class matches:
```text
--- src/graph/sqlite.ts ---
>>37:c30|export class SqliteGraphStore implements GraphStore {

--- src/tools/bm25.ts ---
>>41:9b3|export class BM25Index {
```

Symbol existence:
```text
## SqliteGraphStore (class)
src/graph/sqlite.ts:37:9c6d

## BM25Index (class)
src/tools/bm25.ts:41:1697
```

Repo extension surface (`src/index.ts`-registered tool):
```text
--- SqliteGraphStore ---
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/194
mode: static (heuristic, no runtime evidence)
src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  class [untested]
  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available

--- BM25Index ---
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/194
mode: static (heuristic, no runtime evidence)
src/tools/bm25.ts:41:1697  BM25Index  class [untested]
  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available
```

Shipped implementation:
```text
169:996|  if (node.kind === "class") {
170:9f5|    const classSignals = signalComputer.compute(node.id);
171:c98|    const classLine = formatLiveTraceLine(
...
176:6e4|      classSignals.roles.filter((role) => role !== "leaf"),
...
181:1d0|      "  → class entry: use symbol_graph to inspect methods, or trace a specific method symbol when one is available",
183:a64|    return prependTrustHeader(body, { stats, mode: "heuristic", hasLocalExceptions: classLine.stale });
```

Focused regressions:
```text
(pass) trace does not stop at a class entry point that has methods
(pass) trace static DFS terminates on recursive call cycles and includes all reachable nodes once
2 pass
0 fail
```

**Verify**
- Both live repo-tool traces emit the class-entry redirect line.
- Neither live repo-tool trace renders `[leaf]`; both render `class [untested]`.
- The shipped source removes `leaf` for class entries and appends the redirect.
- The focused regression test for the bug passes, and the existing static-cycle regression remains green.

**Verdict:** pass

### Criterion 2: `trace({ entry: "indexProject", file: "src/indexer/pipeline.ts" })` still returns the current normal multi-node trace.

**Identify**
- Repo-registered `trace` tool output for `indexProject`
- `symbol_graph` for `indexProject`
- Focused regression test: `test/tool-trace-static-fallback.test.ts`

**Evidence**

Symbol existence:
```text
## indexProject (function)
src/indexer/pipeline.ts:53:c752
```

Repo extension surface (`src/index.ts`-registered tool):
```text
--- indexProject ---
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/194
mode: static (heuristic, no runtime evidence)
src/indexer/pipeline.ts:53:c752  indexProject  function [entry-point, untested]
src/indexer/coverage.ts:146:844c  runCoverageIndexStage  function [untested]
src/indexer/coverage.ts:37:053a  parseCoverageReports  function [untested]
src/indexer/coverage.ts:18:ab0f  toPosixPath  function [leaf, untested]
src/indexer/coverage.ts:22:2bdb  countLineAtOffset  function [leaf, untested]
... (continues through multiple nodes)
```

Focused regression:
```text
(pass) trace falls back to a deterministic static call path when no coverage trace exists
1 pass
0 fail
```

**Verify**
- The `indexProject` trace is multi-node on the repo tool surface; it is not collapsed to a single node.
- The existing non-class static-fallback regression still passes.

**Verdict:** pass

### Criterion 3: A truly missing lookup is labeled as a symbol lookup failure, e.g. `Symbol "runPipeline" not found`.

**Identify**
- Direct reproduction output for the diagnosis fixture
- Repo-registered `trace` tool output for `runPipeline`
- `symbol_graph("runPipeline")`
- Shipped `trace` source lines handling not-found
- Focused regression test: `test/repro-080-trace-not-found-message.test.ts`

**Evidence**

Direct reproduction:
```text
--- trace(runPipeline) ---
## Trust
status: fresh
evidence: none  stale-files: 0/0
Symbol "runPipeline" not found in the graph
```

Repo extension surface (`src/index.ts`-registered tool):
```text
--- runPipeline ---
Symbol "runPipeline" not found in the graph
```

Symbol lookup check:
```text
Symbol "runPipeline" not found
```

Shipped implementation:
```text
127:a6c|export function trace(params: TraceParams): string {
128:8b3|  const resolved = resolveUniqueSymbol({
...
133:ef3|    notFoundLabel: "Symbol",
...
140:2f2|  if (resolved.kind === "not_found") {
...
151:24f|    return prependTrustHeader(`Symbol "${params.entry}" not found in the graph\n`, { stats });
```

Focused regression:
```text
(pass) trace labels a missing entry as a symbol lookup failure
```

**Verify**
- Both the diagnosis fixture and the repo tool surface return `Symbol ... not found in the graph`.
- The implementation now passes `notFoundLabel: "Symbol"` and returns the symbol-specific not-found string.
- The targeted regression passes.

**Verdict:** pass

### Criterion 4: A file-filter miss surfaces the real candidate location(s), e.g. `trace({ entry: "walk", file: "src/does-not-exist.ts" })` mentions `src/walk.ts` rather than returning the generic not-found string.

**Identify**
- Direct reproduction output for the diagnosis fixture
- Repo-registered `trace` tool output for a wrong file filter on `walk`
- `symbol_graph("walk")` ambiguous result + one concrete `walk` source
- Shipped `trace` source lines handling unscoped fallback via `findNodes`
- Focused regression test: `test/repro-080-trace-not-found-message.test.ts`

**Evidence**

Direct reproduction (same shape as the diagnosis fixture):
```text
--- trace(walk, file=src/does-not-exist.ts) ---
## Trust
status: fresh
evidence: none  stale-files: 0/0
Symbol "walk" was not found in src/does-not-exist.ts. Matches exist in other files:

  src/walk.ts:1:673a  walk (function)  src/walk.ts
```

Repo extension surface (`src/index.ts`-registered tool):
```text
--- walk-file-filter ---
Symbol "walk" was not found in src/does-not-exist.ts. Matches exist in other files:

  src/indexer/contract-extractor.ts:14:0d3f  walk (function)  src/indexer/contract-extractor.ts
  src/indexer/pipeline.ts:33:8511  walk (function)  src/indexer/pipeline.ts
  src/indexer/tree-sitter.ts:61:0d3f  walk (function)  src/indexer/tree-sitter.ts
```

Symbol checks:
```text
Multiple matches for "walk":

  src/indexer/contract-extractor.ts:14:0d3f  walk (function)  src/indexer/contract-extractor.ts
  src/indexer/pipeline.ts:33:8511  walk (function)  src/indexer/pipeline.ts
  src/indexer/tree-sitter.ts:61:0d3f  walk (function)  src/indexer/tree-sitter.ts
```

```text
## walk (function)
src/indexer/tree-sitter.ts:61:0d3f

### Source
61:0d3f|function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
62:fa40|  visit(node);
63:dfea|  for (const child of node.namedChildren) walk(child, visit);
64:d10b|}
```

Shipped implementation:
```text
140:2f2|  if (resolved.kind === "not_found") {
141:4e2|    if (params.file) {
142:4e4|      const unscopedMatches = params.store.findNodes(params.entry);
143:b90|      if (unscopedMatches.length > 0) {
145:e16|        return prependTrustHeader(
146:f81|          formatFileScopedMiss(params.entry, params.file, unscopedMatches, params.projectRoot),
```

Focused regression:
```text
(pass) trace suggests the real symbol location when the file filter misses
```

**Verify**
- The diagnosis fixture now reports `src/walk.ts` instead of generic not-found text.
- The repo tool surface also reports candidate locations when a file filter misses.
- The shipped source performs an unscoped `findNodes` retry and formats the miss with candidate locations.
- The targeted regression passes.

**Verdict:** pass

### Criterion 5: Existing ambiguity behavior remains unchanged: `trace({ entry: "walk" })` still returns the multi-match disambiguation list.

**Identify**
- Repo-registered `trace` tool output for `walk`
- `symbol_graph("walk")` ambiguous output
- Shipped `trace` source ambiguous branch
- Focused regression test: `test/tool-trace-ambiguous.test.ts`

**Evidence**

Repo extension surface (`src/index.ts`-registered tool):
```text
--- walk-ambiguous ---
Multiple matches for "walk":

  src/indexer/contract-extractor.ts:14:0d3f  walk (function)  src/indexer/contract-extractor.ts
  src/indexer/pipeline.ts:33:8511  walk (function)  src/indexer/pipeline.ts
  src/indexer/tree-sitter.ts:61:0d3f  walk (function)  src/indexer/tree-sitter.ts
```

Symbol check:
```text
Multiple matches for "walk":

  src/indexer/contract-extractor.ts:14:0d3f  walk (function)  src/indexer/contract-extractor.ts
  src/indexer/pipeline.ts:33:8511  walk (function)  src/indexer/pipeline.ts
  src/indexer/tree-sitter.ts:61:0d3f  walk (function)  src/indexer/tree-sitter.ts
```

Shipped implementation:
```text
136:396|  const stats = params.store.getStatistics(params.projectRoot);
137:9de|  if (resolved.kind === "ambiguous") {
138:e33|    return prependTrustHeader(resolved.text, { stats });
139:b18|  }
```

Focused regression:
```text
(pass) trace returns a disambiguation list when entry matches multiple symbols
```

**Verify**
- The repo tool surface still returns the multi-match list for `walk`.
- `symbol_graph("walk")` reports the same ambiguity shape.
- The ambiguous branch remains an explicit pass-through to `resolved.text`.
- The targeted regression passes.

**Verdict:** pass

## Overall Verdict

**pass**

The implementation satisfies all 5 acceptance criteria with fresh evidence from:
- a fresh full test suite run (`404 pass`, `0 fail`, `EXIT:0`)
- direct reproduction of the original bug scenarios showing the old symptoms are gone
- focused regression test runs for the affected and control cases
- the repo’s registered `trace` tool surface via `src/index.ts`
- direct source inspection of `src/tools/trace.ts`
