# Reproduction: trace class entries stop at the class node, and not-found output is too generic

## Steps to Reproduce
1. In this repo, call `trace({ entry: "SqliteGraphStore" })`.
2. As a second class control, call `trace({ entry: "BM25Index", file: "src/tools/bm25.ts" })`.
3. Call `trace({ entry: "indexProject", file: "src/indexer/pipeline.ts" })` as a non-class control.
4. Call `trace({ entry: "runPipeline" })`.
5. Call `trace({ entry: "walk" })`.
6. Call `trace({ entry: "walk", file: "src/indexer/tree-sitter.ts" })`.
7. Call `trace({ entry: "walk", file: "src/does-not-exist.ts" })`.
8. Run `bun test test/repro-079-trace-class-entry-point.test.ts test/repro-080-trace-not-found-message.test.ts`.

## Expected Behavior
- When the entry symbol is a class with behavior, `trace` should not stop at a single class node marked as a leaf. It should either expand into class behavior or emit a redirect/note telling the caller what to trace instead.
- Missing lookups should be labeled as symbol lookup failures (`Symbol "..." not found`).
- If the symbol exists but the supplied `file` filter misses, the output should surface the real candidate location(s) instead of the same generic `Entry "..." not found` message.
- Existing controls should remain unchanged:
  - `trace({ entry: "indexProject", file: "src/indexer/pipeline.ts" })` should still return a normal multi-node trace.
  - `trace({ entry: "walk" })` should still return multiple matches.

## Actual Behavior
Class entry points stop at the class node and are marked as leaves:

```text
trace({ entry: "SqliteGraphStore" })
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/192
mode: static (heuristic, no runtime evidence)
src/graph/sqlite.ts:37:9c6d  SqliteGraphStore  class [leaf, untested]
```

```text
trace({ entry: "BM25Index", file: "src/tools/bm25.ts" })
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/192
mode: static (heuristic, no runtime evidence)
src/tools/bm25.ts:41:1697  BM25Index  class [leaf, untested]
```

Non-class trace still works and descends normally:

```text
trace({ entry: "indexProject", file: "src/indexer/pipeline.ts" })
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/194
mode: static (heuristic, no runtime evidence)
src/indexer/pipeline.ts:53:c752  indexProject  function [entry-point, untested]
src/indexer/coverage.ts:146:844c  runCoverageIndexStage  function [untested]
src/indexer/coverage.ts:37:053a  parseCoverageReports  function [untested]
src/indexer/coverage.ts:18:ab0f  toPosixPath  function [leaf, untested]
...continues...
```

The not-found path still uses the generic `Entry` label and does not distinguish a file-filter miss from a truly missing symbol:

```text
trace({ entry: "runPipeline" })
Entry "runPipeline" not found
```

```text
trace({ entry: "walk" })
Multiple matches for "walk":

  src/indexer/contract-extractor.ts:14:0d3f  walk (function)  src/indexer/contract-extractor.ts
  src/indexer/pipeline.ts:33:8511  walk (function)  src/indexer/pipeline.ts
  src/indexer/tree-sitter.ts:61:0d3f  walk (function)  src/indexer/tree-sitter.ts
```

```text
trace({ entry: "walk", file: "src/indexer/tree-sitter.ts" })
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/192
mode: static (heuristic, no runtime evidence)
src/indexer/tree-sitter.ts:61:0d3f  walk  function [untested]
```

```text
trace({ entry: "walk", file: "src/does-not-exist.ts" })
Entry "walk" not found
```

## Evidence
### Failing tests added for reproduction
Command:

```text
bun test test/repro-079-trace-class-entry-point.test.ts test/repro-080-trace-not-found-message.test.ts
```

Output:

```text
bun test v1.3.11 (af24e281)

test/repro-080-trace-not-found-message.test.ts:
35 | test("trace labels a missing entry as a symbol lookup failure", () => {
36 |   const fixture = setupWalkFixture();
37 |   try {
38 |     const output = trace({ entry: "runPipeline", store: fixture.store, projectRoot: fixture.projectRoot });
39 | 
40 |     expect(output).toContain('Symbol "runPipeline" not found');
                        ^
error: expect(received).toContain(expected)

Expected to contain: "Symbol \"runPipeline\" not found"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nEntry \"runPipeline\" not found"

      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-080-trace-not-found-message.test.ts:40:20)
(fail) trace labels a missing entry as a symbol lookup failure [19.12ms]
53 |       store: fixture.store,
54 |       projectRoot: fixture.projectRoot,
55 |     });
56 | 
57 |     expect(directOutput).toContain("walk");
58 |     expect(wrongFileOutput).toContain("src/walk.ts");
                                 ^
error: expect(received).toContain(expected)

Expected to contain: "src/walk.ts"
Received: "## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nEntry \"walk\" not found"

      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-080-trace-not-found-message.test.ts:58:29)
(fail) trace suggests the real symbol location when the file filter misses [3.90ms]

test/repro-079-trace-class-entry-point.test.ts:
27 |     store.addNode(extracted.module);
28 |     for (const node of extracted.nodes) store.addNode(node);
29 |     for (const edge of extracted.edges) store.addEdge(edge);
30 | 
31 |     const output = trace({ entry: "SqliteGraphStore", file, store, projectRoot });
32 |     expect(output).not.toMatch(/SqliteGraphStore\s+class .*leaf/);
                            ^
error: expect(received).not.toMatch(expected)

Expected substring or pattern: not /SqliteGraphStore\s+class .*leaf/
Received: "## Trust\nstatus: heuristic\nevidence: none  stale-files: 0/0\nmode: static (heuristic, no runtime evidence)\nsrc/store.ts:1:3f9c  SqliteGraphStore  class [entry-point, leaf, untested]\n"

      at <anonymous> (/Users/maxwellnewman/pi/workspace/pi-codegraph/test/repro-079-trace-class-entry-point.test.ts:32:24)
(fail) trace does not stop at a class entry point that has methods [3.84ms]

 0 pass
 3 fail
 4 expect() calls
Ran 3 tests across 2 files. [156.00ms]
```

### Control behavior already works for ambiguous lookups
Command:

```text
bun test test/tool-trace-ambiguous.test.ts
```

Output:

```text
bun test v1.3.11 (af24e281)

test/tool-trace-ambiguous.test.ts:
(pass) trace returns a disambiguation list when entry matches multiple symbols [12.46ms]

 1 pass
 0 fail
 4 expect() calls
Ran 1 test across 1 file. [117.00ms]
```

### Relevant source context
`src/tools/trace.ts`:

```ts
export function trace(params: TraceParams): string {
  const resolved = resolveUniqueSymbol({
    name: params.entry,
    file: params.file,
    store: params.store,
    projectRoot: params.projectRoot,
    notFoundLabel: "Entry",
  });
  ...
  const staticSteps = buildStaticTrace(params.store, node.id)
    .map((step) => formatLiveTraceLine(params.store, step, params.projectRoot, signalComputer));
```

`src/graph/types.ts`:

```ts
export type NodeKind =
  | "function"
  | "class"
  | "interface"
  | "module"
  | "endpoint"
  | "test";
```

`symbol_graph({ name: "SqliteGraphStore", file: "src/graph/sqlite.ts", include: ["source"] })` reports the exact class signature as:

```text
class SqliteGraphStore implements GraphStore { constructor(dbPath: string) }
```

### Recent changes checked
`git log --oneline -20 -- src/tools/trace.ts src/tools/symbol-resolution.ts src/graph/sqlite.ts src/indexer/tree-sitter.ts` showed recent trace-related changes including:

```text
2b4c5693 fix: stale graph refresh, consistent ambiguity handling, single-quote WHERE support (#11)
8566bfee fix: trace static mode visits all reachable callees via DFS (#041) (#26)
```

## Environment
- OS: Darwin 25.3.0 arm64 (`uname -a`)
- Bun: 1.3.11
- Language/runtime: TypeScript + Bun
- Test runner: `bun test` (`package.json` → `"test": "bun test"`)

## Failing Test
### `test/repro-079-trace-class-entry-point.test.ts`
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

test("trace does not stop at a class entry point that has methods", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-079-${Date.now()}`);
  const file = "src/store.ts";
  const content = [
    "export class SqliteGraphStore {",
    "  constructor() {}",
    "  getNode() { return 1; }",
    "  findNodes() { return 2; }",
    "}",
  ].join("\n") + "\n";

  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, file), content);

  const extracted = extractFile(file, content);
  const store = new SqliteGraphStore();
  try {
    store.addNode(extracted.module);
    for (const node of extracted.nodes) store.addNode(node);
    for (const edge of extracted.edges) store.addEdge(edge);

    const output = trace({ entry: "SqliteGraphStore", file, store, projectRoot });
    expect(output).not.toMatch(/SqliteGraphStore\s+class .*leaf/);
    expect(output).toMatch(/constructor|class entry:/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

### `test/repro-080-trace-not-found-message.test.ts`
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

function setupWalkFixture() {
  const projectRoot = join(tmpdir(), `pi-cg-repro-080-${Date.now()}`);
  const file = "src/walk.ts";
  const content = "export function walk() {}\n";

  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, file), content);

  const extracted = extractFile(file, content);
  const store = new SqliteGraphStore();
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);

  return {
    file,
    projectRoot,
    store,
    cleanup() {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("trace labels a missing entry as a symbol lookup failure", () => {
  const fixture = setupWalkFixture();
  try {
    const output = trace({ entry: "runPipeline", store: fixture.store, projectRoot: fixture.projectRoot });

    expect(output).toContain('Symbol "runPipeline" not found');
  } finally {
    fixture.cleanup();
  }
});

test("trace suggests the real symbol location when the file filter misses", () => {
  const fixture = setupWalkFixture();
  try {
    const directOutput = trace({ entry: "walk", file: fixture.file, store: fixture.store, projectRoot: fixture.projectRoot });
    const wrongFileOutput = trace({
      entry: "walk",
      file: "src/does-not-exist.ts",
      store: fixture.store,
      projectRoot: fixture.projectRoot,
    });

    expect(directOutput).toContain("walk");
    expect(wrongFileOutput).toContain("src/walk.ts");
    expect(wrongFileOutput).not.toContain('Entry "walk" not found');
  } finally {
    fixture.cleanup();
  }
});
```

## Reproducibility
Always on the current repo state and environment above.
