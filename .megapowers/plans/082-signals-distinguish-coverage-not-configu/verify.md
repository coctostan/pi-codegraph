## Test Suite Results

### Full suite
Command run fresh:

```bash
bun test
```

Output summary from this session:

```text
bun test v1.3.13 (bf2e2cec)
...
 420 pass
 0 fail
 1214 expect() calls
Ran 420 tests across 171 files. [12.49s]
```

Relevant coverage-state test names present in the full run included:

```text
test/graph-store-coverage-metadata.test.ts:
(pass) SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed [0.65ms]
(pass) SqliteGraphStore.hasCoverageData persists across close + reopen [4.84ms]

test/indexer-coverage-stage-mark-indexed.test.ts:
(pass) runCoverageIndexStage marks coverage indexed even when coverage dir is missing [1.11ms]
(pass) runCoverageIndexStage marks coverage indexed when coverage dir exists with no reports [0.79ms]
(pass) runCoverageIndexStage marks coverage indexed when reports exist but match no nodes [0.98ms]

test/output-signals-format-coverage-unknown.test.ts:
(pass) formatRoleTags emits coverage-unknown when coverage is not indexed [0.04ms]
(pass) formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge
(pass) formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown [0.01ms]

test/output-signals-coverage-known.test.ts:
(pass) NodeSignals.coverageKnown is false when store has no coverage data [1.04ms]
(pass) NodeSignals.coverageKnown is true when store.markCoverageIndexed() was called [0.75ms]

test/signals-coverage-unknown-fresh-index.test.ts:
(pass) manually-populated store with no coverage stage emits coverage-unknown [0.48ms]
(pass) freshly indexed project without coverage reports emits untested (coverage stage ran with no data) [27.17ms]
```

### Type check
Command run fresh:

```bash
bun run check
```

Output:

```text
$ tsc --noEmit
```

The command completed without diagnostics.

### Targeted regression suite
Command run fresh:

```bash
bun test test/graph-store-coverage-metadata.test.ts test/indexer-coverage-stage-mark-indexed.test.ts test/output-signals-format-coverage-unknown.test.ts test/output-signals-coverage-known.test.ts test/signals-coverage-unknown-fresh-index.test.ts test/output-signals.test.ts test/output-signals-impact-why-coverage-unknown.test.ts
```

Output:

```text
bun test v1.3.13 (bf2e2cec)

test/output-signals.test.ts:
(pass) createSignalComputer computes AC-aligned fan-in/out, role, coverage, framework, and co-change signals [7.39ms]

test/graph-store-coverage-metadata.test.ts:
(pass) SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed [0.84ms]
(pass) SqliteGraphStore.hasCoverageData persists across close + reopen [9.60ms]

test/signals-coverage-unknown-fresh-index.test.ts:
(pass) manually-populated store with no coverage stage emits coverage-unknown [1.05ms]
(pass) freshly indexed project without coverage reports emits untested (coverage stage ran with no data) [71.07ms]

test/output-signals-format-coverage-unknown.test.ts:
(pass) formatRoleTags emits coverage-unknown when coverage is not indexed
(pass) formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge [0.14ms]
(pass) formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown

test/output-signals-coverage-known.test.ts:
(pass) NodeSignals.coverageKnown is false when store has no coverage data [0.59ms]
(pass) NodeSignals.coverageKnown is true when store.markCoverageIndexed() was called [0.24ms]

test/indexer-coverage-stage-mark-indexed.test.ts:
(pass) runCoverageIndexStage marks coverage indexed even when coverage dir is missing [0.98ms]
(pass) runCoverageIndexStage marks coverage indexed when coverage dir exists with no reports [0.75ms]
(pass) runCoverageIndexStage marks coverage indexed when reports exist but match no nodes [1.52ms]

test/output-signals-impact-why-coverage-unknown.test.ts:
(pass) formatImpactWhy renders coverage:unknown when coverage is not indexed [0.05ms]
(pass) formatImpactWhy renders coverage:untested when coverage is indexed but symbol has no tested_by edge
(pass) formatImpactWhy renders coverage:tested when symbol has a tested_by edge

 16 pass
 0 fail
 45 expect() calls
Ran 16 tests across 7 files. [143.00ms]
```

### Impact check before relying on tests
Command/tool run:

```text
impact(symbols=["createSignalComputer"], changeType="behavior_change", maxDepth=5)
impact(symbols=["runCoverageIndexStage"], changeType="behavior_change", maxDepth=5)
impact(symbols=["SqliteGraphStore.hasCoverageData"], changeType="behavior_change", maxDepth=5)
```

Output:

```text
No dependents found — 'createSignalComputer' is an entry point with no callers.
No dependents found — 'runCoverageIndexStage' is an entry point with no callers.
Symbol "SqliteGraphStore.hasCoverageData" not found
```

No downstream dependents were surfaced by `impact`, so there were no dependent-specific tests to confirm. The method symbol was not indexed as a standalone impact seed, so I verified it directly by anchored source and the graph-store tests below.

## Bugfix Reproduction

Original symptom reproduced conceptually: a manually populated graph with no coverage indexing state used to have no way to distinguish unknown coverage from known-uncovered and therefore could report `untested`. I ran a direct reproduction against the new implementation.

Command:

```bash
bun --eval '
import { SqliteGraphStore } from "./src/graph/sqlite.ts";
import { createSignalComputer, formatRoleTags } from "./src/output/signals.ts";
const store = new SqliteGraphStore();
try {
  store.addNode({ id: "src/x.ts::fn:1", kind: "function", name: "fn", file: "src/x.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
  const signals = createSignalComputer(store).compute("src/x.ts::fn:1");
  console.log(JSON.stringify({ hasCoverageData: store.hasCoverageData(), tested: signals.tested, coverageKnown: signals.coverageKnown, tags: formatRoleTags(signals) }));
} finally { store.close(); }
'
```

Output:

```text
{"hasCoverageData":false,"tested":false,"coverageKnown":false,"tags":"[entry-point, leaf, coverage-unknown]"}
```

The symptom no longer occurs for this reproduction: with no persisted coverage state and no `tested_by` edge, the tag is `coverage-unknown`, not `untested`.

## Trace and Structural Evidence

### `runCoverageIndexStage` trace

```text
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/201
mode: static (heuristic, no runtime evidence)
src/indexer/coverage.ts:146:844c  runCoverageIndexStage  function [entry-point, untested]
src/indexer/coverage.ts:37:053a  parseCoverageReports  function [untested]
src/indexer/coverage.ts:18:ab0f  toPosixPath  function [leaf, untested]
src/indexer/coverage.ts:22:2bdb  countLineAtOffset  function [leaf, untested]
src/indexer/coverage.ts:30:9b01  isProjectLocalTsFile  function [leaf, untested]
src/indexer/coverage.ts:124:4269  mapCoverageToNodes  function [untested]
src/indexer/coverage.ts:115:1b4e  lineSpan  function [leaf, untested]
src/indexer/coverage.ts:119:eb12  overlaps  function [leaf, untested]
```

Anchored source showing the coverage-stage sentinel write at the end of the traced entry point:

```text
196:b18|  }
197:a6c|  try {
198:fb9|    store.markCoverageIndexed();
199:eef|  } catch {
200:239|    // readonly DB or other write failure: leave sentinel unset
201:b18|  }
202:b18|}
```

AST search:

```text
pattern: $STORE.markCoverageIndexed()
--- src/indexer/coverage.ts ---
>>198:fb9|    store.markCoverageIndexed();
```

### `createSignalComputer` trace

```text
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/201
mode: static (heuristic, no runtime evidence)
src/output/signals.ts:49:59f5  createSignalComputer  function [entry-point, untested]
src/output/signals.ts:25:1aea  uniqueNeighborCount  function [leaf, untested]
src/output/signals.ts:29:9a28  hasFrameworkMediation  function [leaf, untested]
src/output/signals.ts:33:cda7  sortRoles  function [leaf, untested]
src/output/signals.ts:83:1257  computeCoChangeScore  function [untested]
src/output/signals.ts:37:96c2  parseGitCoChanges  function [leaf, untested]
src/output/signals.ts:44:e7e6  changedSetKey  function [leaf, untested]
src/output/signals.ts:56:c65e  findModuleNode  function [leaf, untested]
src/output/signals.ts:66:d478  computeChangedModuleIds  function [untested]
```

Anchored source and AST search showing the graph-level coverage-state read:

```text
49:68a|export function createSignalComputer(store: GraphStore): SignalComputer {
50:9ba|  const moduleByFileCache = new Map<string, GraphNode | null>();
51:816|  const baseSignalsCache = new Map<string, Omit<NodeSignals, "coChangeScore">>();
52:9b1|  const changedModuleIdsCache = new Map<string, Set<string>>();
53:95e|  const coChangeScoreCache = new Map<string, number>();
54:ca9|  const coverageKnown = store.hasCoverageData();
```

```text
pattern: $STORE.hasCoverageData()
--- src/output/signals.ts ---
>>54:ca9|  const coverageKnown = store.hasCoverageData();
```

## Per-Criterion Verification

### Criterion 1: `GraphStore` declares a `hasCoverageData(): boolean` method for reading graph-level coverage indexing state.

**IDENTIFY:** Inspect `src/graph/store.ts` interface and confirm the method exists. Use `symbol_graph` for `GraphStore`.

**Evidence:**

```text
## GraphStore (interface)
src/graph/store.ts:30:c121
...
hasCoverageData(): boolean
markCoverageIndexed(): void
...
48:dda3|  hasCoverageData(): boolean;
49:7993|  markCoverageIndexed(): void;
```

**Verdict:** pass. `GraphStore` declares `hasCoverageData(): boolean` at `src/graph/store.ts:48`.

### Criterion 2: `SqliteGraphStore.hasCoverageData()` returns `false` when no coverage-indexed metadata has been persisted for the database.

**IDENTIFY:** Inspect implementation and run graph-store metadata test.

**Evidence:**

```text
326:1c0|  hasCoverageData(): boolean {
327:724|    const row = this.db
328:9b9|      .prepare(`SELECT value FROM graph_metadata WHERE key = ?`)
329:22a|      .get("coverage_indexed") as { value: string } | null;
330:bf2|    return row?.value === "1";
331:b18|  }
```

Test output:

```text
(pass) SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed [0.84ms]
```

The test source checks the initial false value:

```text
7:5dc|test("SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed", () => {
8:4c5|  const store = new SqliteGraphStore();
9:a6c|  try {
10:6dc|    expect(store.hasCoverageData()).toBe(false);
```

**Verdict:** pass. No row returns `undefined`, so `row?.value === "1"` is `false`; the test confirms this behavior.

### Criterion 3: `SqliteGraphStore.hasCoverageData()` returns `true` after coverage-indexed metadata has been persisted, and the value survives closing and reopening the same SQLite database.

**IDENTIFY:** Inspect `markCoverageIndexed()`, then run persistence test.

**Evidence:**

```text
333:b80|  markCoverageIndexed(): void {
334:4ff|    this.db
335:39d|      .prepare(`INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)`)
336:fe2|      .run("coverage_indexed", "1");
337:b18|  }
```

Persistence test source:

```text
21:cee|test("SqliteGraphStore.hasCoverageData persists across close + reopen", () => {
26:426|    const a = new SqliteGraphStore(dbPath);
27:162|    expect(a.hasCoverageData()).toBe(false);
28:bbb|    a.markCoverageIndexed();
29:383|    a.close();
31:b16|    const b = new SqliteGraphStore(dbPath);
32:a6c|    try {
33:271|      expect(b.hasCoverageData()).toBe(true);
```

Test output:

```text
(pass) SqliteGraphStore.hasCoverageData persists across close + reopen [9.60ms]
```

**Verdict:** pass. The metadata table persists `coverage_indexed=1` and the reopen test confirms it remains true.

### Criterion 4: `runCoverageIndexStage(store, projectRoot, coverageDir)` persists coverage-indexed state after a successful coverage-stage execution, including successful executions that produce zero outgoing `tested_by` edges.

**IDENTIFY:** Inspect `runCoverageIndexStage` source and run zero-edge coverage-stage tests.

**Evidence:** `symbol_graph` confirms the entry point and shape:

```text
## runCoverageIndexStage (function)
src/indexer/coverage.ts:146:844c

### Signature
(store: GraphStore, projectRoot: string, coverageDir: string) => void

### Key Relationships
  Callees (2):  parseCoverageReports, mapCoverageToNodes
```

Source shows `markCoverageIndexed()` occurs after report processing:

```text
146:844c|export function runCoverageIndexStage(store: GraphStore, projectRoot: string, coverageDir: string): void {
147:7276|  const normalized = parseCoverageReports(projectRoot, coverageDir);
148:0d42|  const mapped = mapCoverageToNodes(store, normalized);
...
196:b18|  }
197:a6c|  try {
198:fb9|    store.markCoverageIndexed();
199:eef|  } catch {
200:239|    // readonly DB or other write failure: leave sentinel unset
201:b18|  }
202:b18|}
```

Tests cover missing coverage dir, empty coverage dir, and reports matching no nodes:

```text
8:e16|test("runCoverageIndexStage marks coverage indexed even when coverage dir is missing", () => {
13:6dc|    expect(store.hasCoverageData()).toBe(false);
14:635|    runCoverageIndexStage(store, projectRoot, join(projectRoot, ".codegraph", "coverage"));
15:83e|    expect(store.hasCoverageData()).toBe(true);

22:4f2|test("runCoverageIndexStage marks coverage indexed when coverage dir exists with no reports", () => {
28:b01|    runCoverageIndexStage(store, projectRoot, coverageDir);
29:83e|    expect(store.hasCoverageData()).toBe(true);

36:330|test("runCoverageIndexStage marks coverage indexed when reports exist but match no nodes", () => {
40:002|  // coverage report references a file that has no nodes in the store
44:b01|    runCoverageIndexStage(store, projectRoot, coverageDir);
45:83e|    expect(store.hasCoverageData()).toBe(true);
```

Test output:

```text
(pass) runCoverageIndexStage marks coverage indexed even when coverage dir is missing [0.98ms]
(pass) runCoverageIndexStage marks coverage indexed when coverage dir exists with no reports [0.75ms]
(pass) runCoverageIndexStage marks coverage indexed when reports exist but match no nodes [1.52ms]
```

**Verdict:** pass. The stage writes the metadata flag after successful processing, and tests confirm zero-edge cases still mark coverage indexed.

### Criterion 5: A symbol with an outgoing `tested_by` edge continues to emit the `tested` signal tag and must not emit `untested` or `coverage-unknown`; runtime-only execution without an outgoing `tested_by` edge must not be treated as `tested`.

**IDENTIFY:** Inspect `createSignalComputer` and `formatRoleTags`, run targeted tests and a direct runtime-only script.

**Evidence:** `createSignalComputer` treats only outgoing `tested_by` edges as `tested`:

```text
140:092|        const fanIn = uniqueNeighborCount(store.getNeighbors(nodeId, { direction: "in", kind: "calls" }));
141:daf|        const fanOut = uniqueNeighborCount(store.getNeighbors(nodeId, { direction: "out", kind: "calls" }));
142:3b9|        const tested = store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).length > 0;
```

`formatRoleTags` gives `tested` precedence over both other coverage tags:

```text
174:6cf|export function formatRoleTags(signals: NodeSignals): string {
175:c13|  const coverageTag = signals.tested
176:3a9|    ? "tested"
177:56e|    : signals.coverageKnown
178:f0c|      ? "untested"
179:a3e|      : "coverage-unknown";
180:115|  const tags = [...sortRoles(signals.roles, ROLE_ORDER), coverageTag];
```

Test source and output:

```text
27:63f|test("formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown", () => {
28:7f5|  expect(formatRoleTags({ ...base, tested: true, coverageKnown: false })).toBe(
29:7be|    "[leaf, tested]",
31:145|  expect(formatRoleTags({ ...base, tested: true, coverageKnown: true })).toBe(
32:7be|    "[leaf, tested]",
```

```text
(pass) formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown
```

Runtime-only direct check, with a saved test trace but no outgoing `tested_by` edge:

```bash
bun --eval '<script creating prod/test nodes, saving a TestTraceRecord without adding tested_by, and computing signals>'
```

Output:

```text
{"outgoingTestedBy":0,"tested":false,"coverageKnown":true,"tags":"[leaf, untested]"}
```

**Verdict:** pass. `tested` is based only on outgoing `tested_by`; a saved runtime trace alone does not make the symbol tested.

### Criterion 6: A symbol with no outgoing `tested_by` edge emits the `coverage-unknown` signal tag when `store.hasCoverageData()` is `false`.

**IDENTIFY:** Run the bug reproduction and targeted signal tests; inspect `formatRoleTags` coverage branch.

**Evidence:** Direct reproduction output:

```text
{"hasCoverageData":false,"tested":false,"coverageKnown":false,"tags":"[entry-point, leaf, coverage-unknown]"}
```

Test source:

```text
17:b91|test("manually-populated store with no coverage stage emits coverage-unknown", () => {
30:57d|    const signals = createSignalComputer(store).compute("src/x.ts::fn:1");
31:6ce|    expect(signals.coverageKnown).toBe(false);
32:280|    expect(formatRoleTags(signals)).toContain("coverage-unknown");
```

Formatter unit test:

```text
15:6ff|test("formatRoleTags emits coverage-unknown when coverage is not indexed", () => {
16:230|  expect(formatRoleTags({ ...base, tested: false, coverageKnown: false })).toBe(
17:83b|    "[leaf, coverage-unknown]",
```

Test output:

```text
(pass) manually-populated store with no coverage stage emits coverage-unknown [1.05ms]
(pass) formatRoleTags emits coverage-unknown when coverage is not indexed
```

**Verdict:** pass.

### Criterion 7: A symbol with no outgoing `tested_by` edge emits the `untested` signal tag when `store.hasCoverageData()` is `true`.

**IDENTIFY:** Run tests for marked/indexed coverage state with no `tested_by` edges.

**Evidence:** Test source:

```text
38:ea5|test("freshly indexed project without coverage reports emits untested (coverage stage ran with no data)", async () => {
48:f03|    await indexProject(projectRoot, store, { lspClientFactory: () => fakeClient });
49:83e|    expect(store.hasCoverageData()).toBe(true);
51:106|    const fn = store.findNodes("fn", "src/app.ts")[0]!;
52:e7c|    const signals = createSignalComputer(store).compute(fn.id);
53:007|    expect(signals.coverageKnown).toBe(true);
54:817|    expect(signals.tested).toBe(false);
55:054|    expect(formatRoleTags(signals)).toContain("untested");
56:932|    expect(formatRoleTags(signals)).not.toContain("coverage-unknown");
```

Formatter unit test:

```text
21:1be|test("formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge", () => {
22:c9a|  expect(formatRoleTags({ ...base, tested: false, coverageKnown: true })).toBe(
23:df8|    "[leaf, untested]",
```

Test output:

```text
(pass) freshly indexed project without coverage reports emits untested (coverage stage ran with no data) [71.07ms]
(pass) formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge [0.14ms]
```

**Verdict:** pass.

### Criterion 8: For the same graph inputs, changing only the graph-level coverage-indexed state must not change non-coverage signal behavior, including roles, fan-in, fan-out, framework mediation, export status, and co-change score.

**IDENTIFY:** Inspect the signal construction and run a direct before/after comparison where only `markCoverageIndexed()` changes graph metadata.

**Evidence:** Non-coverage fields are computed independently of `coverageKnown`:

```text
140:092|        const fanIn = uniqueNeighborCount(store.getNeighbors(nodeId, { direction: "in", kind: "calls" }));
141:daf|        const fanOut = uniqueNeighborCount(store.getNeighbors(nodeId, { direction: "out", kind: "calls" }));
142:3b9|        const tested = store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).length > 0;
143:1f5|        const frameworkMediated = hasFrameworkMediation(store, nodeId);
144:57d|        const isExported = Boolean(node.is_exported);
146:bac|        const roles: NodeRole[] = [];
147:8a7|        if (isExported && node.kind !== "module" && fanIn === 0) roles.push("entry-point");
148:498|        if (fanIn >= 3 && fanOut >= 3) roles.push("hub");
149:73a|        if (fanOut === 0) roles.push("leaf");
150:e28|        if (frameworkMediated) roles.push("framework-mediated");
```

Direct comparison command output:

```text
{"before":{"roles":["entry-point","leaf"],"fanIn":0,"fanOut":0,"frameworkMediated":false,"isExported":true,"coChangeScore":7},"after":{"roles":["entry-point","leaf"],"fanIn":0,"fanOut":0,"frameworkMediated":false,"isExported":true,"coChangeScore":7},"nonCoverageEqual":true,"coverageBefore":false,"coverageAfter":true}
```

The existing comprehensive signal test also covers fan-in/out, roles, framework mediation, tested state, and co-change score:

```text
187:4d3|    const sharedSignals = computer.compute(shared.id, [shared.id]);
188:d06|    expect(sharedSignals.fanIn).toBe(3);
189:110|    expect(sharedSignals.fanOut).toBe(3);
190:ba8|    expect(sharedSignals.roles).toEqual(["hub", "framework-mediated"]);
191:398|    expect(sharedSignals.tested).toBe(true);
192:3c7|    expect(sharedSignals.frameworkMediated).toBe(true);
206:bfd|    const apiSignals = computer.compute(apiConsumer.id, [shared.id]);
207:5de|    expect(apiSignals.coChangeScore).toBe(7);
```

Test output:

```text
(pass) createSignalComputer computes AC-aligned fan-in/out, role, coverage, framework, and co-change signals [7.39ms]
```

**Verdict:** pass. The direct comparison shows only coverage state changed; all enumerated non-coverage fields remained identical, including a nonzero co-change score.

### Criterion 9: Existing signal tests are updated for the new coverage-state semantics, and `bun test` plus `bun run check` pass.

**IDENTIFY:** Confirm test files for new semantics exist and pass; confirm full suite and type check pass.

**Evidence:** Updated/new test files found and executed:

```text
test/output-signals-format-coverage-unknown.test.ts
test/output-signals-coverage-known.test.ts
test/signals-coverage-unknown-fresh-index.test.ts
test/output-signals-impact-why-coverage-unknown.test.ts
test/output-signals.test.ts
```

Targeted output:

```text
 16 pass
 0 fail
 45 expect() calls
Ran 16 tests across 7 files. [143.00ms]
```

Full suite output:

```text
 420 pass
 0 fail
 1214 expect() calls
Ran 420 tests across 171 files. [12.49s]
```

Type check output:

```text
$ tsc --noEmit
```

**Verdict:** pass.

## Overall Verdict

pass

All nine acceptance criteria are verified by anchored source inspection plus fresh command output. The original bug symptom was reproduced against the new implementation and now returns `coverage-unknown` when coverage data is absent. The full `bun test` suite and `bun run check` completed successfully in this session.