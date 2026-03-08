## Task 1: Add deterministic V8 coverage parser

The task is not executable as written.

### Step 1 fixes
Your test snippet is missing required declarations and currently will not compile (`appSource`, `appText`, `testText` are referenced before declaration). Use a complete setup like:

```ts
const appSource = [
  "export function prod() {",
  "  return 1;",
  "}",
  "",
  "export function helper() {",
  "  return prod();",
  "}",
  "",
].join("\n");
const testSource = [
  "export function prodTest() {",
  "  return 1;",
  "}",
  "",
].join("\n");

writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");
```

Also add explicit assertions for AC2 and AC4 in this same test file:
- non-local URL is ignored
- non-`.ts/.tsx` URL is ignored
- malformed JSON file is skipped (indexing continues)

### Step 3 fixes
Your Step 3 block is missing structure (`export interface NormalizedCoverageRecord { ... }`, `for (const fileName of fileNames)`, `for (const fn of functions)`, etc.). Replace with a syntactically complete file block.

Also implement malformed-file handling explicitly (AC4):

```ts
for (const fileName of fileNames) {
  let raw: { result?: unknown[] };
  try {
    raw = JSON.parse(readFileSync(resolve(coverageDir, fileName), "utf8"));
  } catch {
    continue;
  }
  // continue parsing entries...
}
```

And handle missing coverage directory deterministically:

```ts
if (!existsSync(coverageDir)) return [];
```

---

## Task 4: Index coverage artifacts into tested_by edges and stored traces

This task currently has multiple correctness and compile issues.

### Step 1 fixes
The test snippet is missing `fakeClient`, `appSource`, `appText`, and `store` declarations, so it will not run.

Define `fakeClient` exactly as `ITsServerClient`:

```ts
const fakeClient: ITsServerClient = {
  async open() {},
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};
```

Ensure the test asserts stored trace content via `store.getTestTrace(testNode.id)` and asserts rerun idempotence (`tested_by` still length 1).

### Step 3 fixes (coverage stage)
Current pseudocode creates a cross-product of all tests × all production symbols and references `prod` without declaration. That violates AC7/AC9 intent.

Use a deterministic per-report grouping rule in code. At minimum:
1. Keep `reportFile` on each normalized record.
2. Group mapped records by `reportFile`.
3. For each group, resolve test nodes in that group and production nodes in that group.
4. For each resolved test node, add `tested_by` edges only to production nodes from the same group.
5. Build that test’s stored trace as `[test, ...productionSortedWithinGroup]`.

### Step 3 fixes (pipeline)
Your `pipeline.ts` snippet is missing imports/types (`GraphStore`, `IndexResult`, `currentRel`) and won’t compile.

Use the existing signature in `src/indexer/pipeline.ts` and extend it safely:
- add `coverageDir?: string` to `IndexProjectOptions`
- keep existing `currentRel` cleanup logic intact
- call `runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"))` after Stage 3

---

## Task 5: Return coverage-backed traces for tests and production symbols

Task is currently incomplete and non-compiling.

### Step 1 fixes
Your test code is missing:
- `test("...", () => { ... })` wrapper
- `const store = new SqliteGraphStore()`
- `store.addNode(alpha)`
- `const byProd = trace({ entry: "prod", file: "src/app.ts", store, projectRoot })`

Without these, Step 1 cannot run.

### Step 3 fixes
Provide a full compilable `src/tools/trace.ts` block (current snippet references undefined `testTraceId`, `record`, `lines`).

Use this concrete flow:

```ts
const node = resolveNode(params.store, params.entry, params.file);
if (!node) return `Entry "${params.entry}" not found`;

const testTraceId = resolveCoverageTraceId(params.store, node.id);
if (!testTraceId) return `Entry "${params.entry}" not found`;

const record = params.store.getTestTrace(testTraceId);
if (!record) return `Entry "${params.entry}" not found`;

const lines = ["mode: coverage"];
for (const step of [...record.steps].sort((a, b) => a.ordinal - b.ordinal)) {
  lines.push(formatTraceLine(params.store, step.nodeId, params.projectRoot));
}
return `${lines.join("\n")}\n`;
```

Also keep deterministic test selection rule explicit in comments and code (sort by `candidate.node.id`).

---

## Task 6: Resolve endpoint entries to coverage-backed traces

### Step 1 fixes
The test is missing a `test(...)` wrapper and `store` creation, and it never adds the endpoint node or `routes_to` edge.

Must include:

```ts
store.addNode(endpoint);
store.addEdge({
  source: handler.id,
  target: endpoint.id,
  kind: "routes_to",
  provenance: { source: "ast-grep", confidence: 0.9, evidence: "app.get('/users', handler)", content_hash: "h-api" },
  created_at: 1,
});
```

Without this, endpoint resolution path is not actually tested.

### Step 3 fixes
Keep endpoint handling consistent with existing graph orientation (handler -> endpoint):

```ts
store.getNeighbors(endpointNode.id, { direction: "in", kind: "routes_to" })
```

And keep deterministic selection by sorting handlers and tested_by candidates by `node.id`.

---

## Task 7: Fall back to deterministic static traces when coverage is missing

This task mostly works, but revise two things for plan quality.

1. Add explicit `**ACs covered:** 15` line (currently missing in task file).
2. Remove endpoint-specific logic from this task’s implementation snippet (or add `[depends: 6]`). Endpoint handling belongs to Task 6 and currently introduces dependency leakage.

---

## Task 8: Mark stale and unresolved trace steps without failing the trace

### Step 1 fixes
Test snippet is missing `test(...)` wrapper and `const store = new SqliteGraphStore()`.

### Step 3 fixes
The snippet references `coverageTraceId` without declaring it. Add:

```ts
const coverageTraceId = resolveCoverageTraceId(params.store, node.id);
```

before `if (coverageTraceId) { ... }`.

Also preserve both stale signals:
- anchor staleness from `computeAnchor(node, projectRoot).stale`
- stored step hash mismatch (`node.content_hash !== storedHash`)

and keep unresolved step rendering exactly deterministic:

```ts
`${nodeId}  unresolved [stale]`
```

---

## Task 9: Wire the trace tool into the extension

### Step 3 fixes
Current Step 3 block is not self-contained (`const SymbolGraphParams = Type.Object(...)` is missing in snippet). Replace with a minimal diff instead of full-file rewrite.

Only add:
1. `import { trace } from "./tools/trace.js";`
2. `const TraceParams = Type.Object({ entry: Type.String(...), file: Type.Optional(Type.String(...)) });`
3. new `pi.registerTool({ name: "trace", ... })` block.

Do not restate unrelated existing tool registrations in this task.

### Step 4/5 command fix
Use the same focused command in Step 4 (`bun test test/extension-wiring.test.ts`) and full suite in Step 5 (`bun test`). Keep both explicit as separate steps.