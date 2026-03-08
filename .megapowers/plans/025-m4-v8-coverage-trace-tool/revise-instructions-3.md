## Task 2: Map coverage ranges to graph nodes

Your Step 3 code block rewrites `src/indexer/coverage.ts` and drops Task 1 behavior (`existsSync` guard + malformed JSON skip). Keep the Task 1 parser behavior intact and only add mapping helpers.

### What to change
1. Keep this parser guard from Task 1:
```ts
if (!existsSync(coverageDir)) return [];
try {
  raw = JSON.parse(readFileSync(resolve(coverageDir, fileName), "utf8")) as { result?: unknown[] };
} catch {
  continue;
}
```
2. Add mapping logic without replacing parser internals.
3. Ensure `mapCoverageToNodes()` has the full loop body:
```ts
for (const record of records) {
  const candidates = store
    .getNodesByFile(record.file)
    .filter((node) => overlaps(node, record.startLine, record.endLine))
    .sort((a, b) => lineSpan(a) - lineSpan(b) || a.start_line - b.start_line || a.id.localeCompare(b.id));

  const resolved = candidates[0];
  if (!resolved) continue;
  mapped.push({ ...record, node: resolved });
}
```

## Task 4: Index coverage artifacts into tested_by edges and stored traces

This task currently has multiple compile-time errors in both test and implementation snippets.

### Step 1 fixes (test)
- Define `testedBy` before assertions:
```ts
const testedBy = store.getNeighbors(prodNode.id, { direction: "out", kind: "tested_by" });
```
- Keep this test focused on one behavior. Split dedupe re-run into a second test in the same file.

### Step 2 expected failure
Current expected failure assumes behavior-level assertion failure, but with the current snippet the first failure is compile/runtime reference errors. Update expected failure to match the actual first failure after fixing Step 1 syntax.

### Step 3 fixes (`src/indexer/coverage.ts`)
Do not paste a broken full-file replacement. Extend Task 2 code with a new function:
```ts
export function runCoverageIndexStage(store: GraphStore, projectRoot: string, coverageDir: string): void
```
Also restore missing declarations/loops:
- add `const records: NormalizedCoverageRecord[] = [];` in parser
- add `for (const record of records)` in `mapCoverageToNodes`
- add `const resolved = candidates[0];`

### Step 3 fixes (`src/indexer/pipeline.ts`)
Patch the existing file shape (from current repo), do not replace with malformed code.
- Keep `walkTsFiles()` with nested `walk(dir)` function.
- Keep `let indexed = 0;` (currently missing in your snippet).
- Extend `IndexProjectOptions` with:
```ts
coverageDir?: string;
```
- Add after AST-grep stage:
```ts
runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
```

## Task 5: Return coverage-backed traces for tests and production symbols

`pickCoverageTraceForNode()` is syntactically incomplete.

### Step 3 fix
Replace the function body with a valid deterministic selection loop:
```ts
function pickCoverageTraceForNode(store: GraphStore, nodeId: string): string | null {
  const coveringTests = store
    .getNeighbors(nodeId, { direction: "out", kind: "tested_by" })
    .sort((a, b) => a.node.id.localeCompare(b.node.id));

  for (const candidate of coveringTests) {
    const trace = store.getTestTrace(candidate.node.id);
    if (trace) return trace.testNodeId;
  }

  return null;
}
```

## Task 7: Fall back to deterministic static traces when coverage is missing

Both Step 1 and Step 3 are currently not executable.

### Step 1 fixes (test)
Wrap in a test function and create missing variables:
```ts
test("trace falls back to deterministic static traversal when no coverage trace exists", () => {
  const store = new SqliteGraphStore();
  // ... add entry/first/second nodes
  store.addNode(entry);
  store.addNode(first);
  store.addNode(second);
  const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
  expect(output).toContain("mode: static");
});
```

### Step 3 fixes (`src/tools/trace.ts`)
- Restore the missing interface declaration:
```ts
export interface TraceParams {
  entry: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}
```
- Restore the `while` loop in `buildStaticTrace()`:
```ts
while (currentId && !seen.has(currentId)) {
  seen.add(currentId);
  ordered.push(currentId);
  const next = ...;
  currentId = next?.node.id ?? null;
}
```

## Task 9: Wire the trace tool into the extension

Step 1 test snippet is incomplete and will not run.

### Step 1 fixes (`test/extension-wiring.test.ts`)
Add a complete new test block (do not replace existing tests):
```ts
test("pi extension registers trace tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((t) => t.name === "trace");
  expect(traceTool).toBeDefined();
  const schema = traceTool!.parameters as any;
  expect(schema.properties.entry).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("entry");
  expect(schema.required).not.toContain("file");
});
```

### Step 3 fix (`src/index.ts`)
Keep existing tool registrations and append trace registration after `impact` using the existing helper signatures already in file:
- `getOrCreateStore(projectRoot: string)`
- `ensureIndexed(projectRoot: string, store: GraphStore)`

Do not remove/replace existing `symbol_graph`, `resolve_edge`, or `impact` tool code.
