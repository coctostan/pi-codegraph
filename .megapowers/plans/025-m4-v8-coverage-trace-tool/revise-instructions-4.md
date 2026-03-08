## Task 1: Add deterministic V8 coverage parser

Step 1 does not fully cover AC4. The current test only proves that an invalid JSON file is skipped; AC4 is about malformed coverage **entries** inside otherwise valid input.

Add one malformed entry inside a valid report and assert the parser still returns the good records. For example, keep the current malformed JSON file, but also add an entry like:

```ts
{
  url: new URL(`file://${join(projectRoot, "src", "missing.ts")}`).href,
  functions: [{ functionName: "broken", ranges: [{ startOffset: 0, endOffset: 1, count: 1 }] }],
}
```

Then keep the expectation that `parseCoverageReports()` returns only the valid `app.test.ts`, `helper`, and `prod` records.

Step 3 needs per-entry error handling so one bad URL or unreadable local file does not abort the whole parse. Wrap URL/file resolution for each entry:

```ts
let filePath: string;
let content: string;
try {
  filePath = url.startsWith("file://") ? fileURLToPath(url) : url;
  if (!isAbsolute(filePath) || !isProjectLocalTsFile(projectRoot, filePath)) continue;
  content = readFileSync(filePath, "utf8");
} catch {
  continue;
}
```

Use `fileURLToPath()` from `node:url` instead of `new URL(url).pathname` so file URLs are decoded correctly.

## Task 2: Map coverage ranges to graph nodes

Step 1 is not executable as written. The test body starts immediately after the imports, but it is missing the `test(..., () => { ... })` wrapper. It should start like this:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { mapCoverageToNodes, type NormalizedCoverageRecord } from "../src/indexer/coverage.js";

test("mapCoverageToNodes resolves same-file overlapping nodes and prefers the smallest span", () => {
  const store = new SqliteGraphStore();
  try {
    // existing fixture setup
  } finally {
    store.close();
  }
});
```

Once Step 1 is syntactically valid, Step 2’s expected failure can stay:

```text
FAIL — SyntaxError: Export named 'mapCoverageToNodes' not found in module '../src/indexer/coverage.js'
```

Keep the implementation on the existing `GraphStore` APIs that already exist today: `getNodesByFile(file)` and `GraphNode.start_line` / `end_line`.

## Task 4: Index coverage artifacts into tested_by edges and stored traces

Step 1 is missing the fake tsserver client declaration. Right after the imports, add the real declaration used elsewhere in the repo:

```ts
const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};
```

Without that, the test file is a syntax error and will not fail for the intended reason.

Step 3 for `src/indexer/coverage.ts` is currently not workable. It pastes a truncated version of `parseCoverageReports()` with missing declarations (`records`, `fileName`, `filePath`, `content`, loops, and the `NormalizedCoverageRecord` interface header). Do **not** replace the Task 1/2 implementation with that partial paste. Instead, extend the already-correct Task 1/2 file with one new exported function:

```ts
export function runCoverageIndexStage(store: GraphStore, projectRoot: string, coverageDir: string): void {
  const normalized = parseCoverageReports(projectRoot, coverageDir);
  const mapped = mapCoverageToNodes(store, normalized);
  // group by report file, split test vs non-test nodes, add tested_by edges,
  // and save one deterministic ordered trace per resolved test node
}
```

Inside `runCoverageIndexStage()`:
- group mapped records by `reportFile`
- sort report groups by `reportFile`
- sort test records by `node.id`
- sort covered non-test records by `file`, then `startLine`, then `node.id`
- add `tested_by` edges with `kind: "tested_by"` and `provenance.source: "coverage"`
- call `store.saveTestTrace(...)` once per resolved test node using ordinals `0..N`

For AC10 idempotence, rely on the existing `edges` primary key plus `saveTestTrace()` replacement semantics from Task 3. Do not introduce duplicate rows.

Step 3 for `src/indexer/pipeline.ts` must be based on the current file in `src/indexer/pipeline.ts`, not a rewritten/truncated copy. Make these concrete edits instead:

1. Add the import:
```ts
import { runCoverageIndexStage } from "./coverage.js";
```

2. Extend `IndexProjectOptions` with:
```ts
coverageDir?: string;
```

3. After `await runAstGrepIndexStage(store, projectRoot, changedFiles);`, call:
```ts
runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
```

4. Preserve the existing return statement:
```ts
return { indexed, skipped, removed, errors };
```

Do not remove `currentRel` or the existing delete/missing-file logic from the current implementation.

## Task 5: Return coverage-backed traces for tests and production symbols

Step 1 is missing the `test(...)` wrapper. It should be:

```ts
test("trace returns stored coverage traces for tests and deterministically selects one covering test for a production symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-coverage-${Date.now()}`);
  // existing fixture setup
});
```

Without that wrapper, the file fails with a syntax error instead of the expected missing-module failure.

Keep the deterministic selection rule explicit in Step 3: sort `tested_by` neighbors by `candidate.node.id` and pick the first candidate that has a stored test trace.

## Task 7: Fall back to deterministic static traces when coverage is missing

Step 1 is not executable. It has three concrete problems:

1. Missing `test(...)` wrapper.
2. The `entry` node is never added to the store.
3. `output` is asserted but never defined.

Use this shape instead:

```ts
test("trace falls back to a deterministic static call path when no coverage trace exists", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n",
  );

  const store = new SqliteGraphStore();
  try {
    const entry = { id: "src/app.ts::entry:1", kind: "function" as const, name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const first = { id: "src/app.ts::first:2", kind: "function" as const, name: "first", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };
    const second = { id: "src/app.ts::second:3", kind: "function" as const, name: "second", file: "src/app.ts", start_line: 3, end_line: 3, content_hash: "h-app" };

    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    // existing calls edges

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    expect(output).toContain("mode: static");
    expect(output).toContain("entry");
    expect(output).toContain("first");
    expect(output).toContain("second");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Step 3 also has a real compile error: `coverageTraceId` is used before it is declared. Add this line before the `if (coverageTraceId)` block:

```ts
const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
```

Keep the fallback deterministic by sorting outbound `calls` neighbors by `file`, then `start_line`, then `id`, and always following the first one.

## Task 9: Wire the trace tool into the extension

Step 1 is missing the `traceTool` lookup before assertions. Append this line after calling `piCodegraph(...)`:

```ts
const traceTool = registeredTools.find((t) => t.name === "trace");
```

The full new test should mirror the style already used in `test/extension-wiring.test.ts` for `symbol_graph` and `resolve_edge`.

Step 3 should be expressed as targeted edits to the real `src/index.ts`, not as a free-floating snippet. Use the existing patterns in that file:
- import the implementation near the other tool imports:
```ts
import { trace } from "./tools/trace.js";
```
- define `TraceParams` with required `entry` and optional `file`
- register the tool with the same execute return shape used by the existing tools:
```ts
return { content: [{ type: "text", text }], details: undefined };
```

Do not change the existing `symbol_graph`, `resolve_edge`, or `impact` registrations while adding the new one.