## Task 1: Add shared result-scoped freshness evaluator

Step 1 currently puts fresh output, stale target files, stale neighbor files, stale edges, deleted files, timestamps, and formatter behavior into one large test case:

```ts
test("evaluateFreshness reports scoped fresh, stale target, deleted file, stale edge, timestamp, and formatted details", () => {
  // many independent scenarios...
});
```

Split this into focused named test cases in the same test file so each failure identifies one behavior. Keep the same actual APIs (`SqliteGraphStore`, `GraphNode`, `GraphEdge`, `sha256Hex`, `evaluateFreshness`, `formatFreshnessHeader`), but structure it like:

```ts
test("evaluateFreshness returns Trust: fresh for fresh scoped target nodes", () => {
  // create projectRoot/store/target; assert status === "fresh" and header === "Trust: fresh"
});

test("evaluateFreshness returns stale when the requested target node changed", () => {
  // mutate target file; assert status === "stale", changedFiles, affectedSymbols, indexed_at detail
});

test("evaluateFreshness returns partial when only a returned neighbor node changed", () => {
  // mutate neighbor file; assert status === "partial" and affectedSymbols === ["neighbor"]
});

test("evaluateFreshness counts stale edge provenance against the source evidence file", () => {
  // pass edge with old provenance.content_hash; assert staleEdgeCount === 1 and header contains "stale edges: 1"
});

test("evaluateFreshness reports deleted returned files deterministically", () => {
  // unlink returned neighbor file; assert deletedFiles contains src/neighbor.ts and no wall-clock prose is invented
});
```

This keeps the task self-contained while satisfying the plan-review granularity rule that one `test(...)` should not cover several independent behaviors.

## Task 2: Strip compact freshness headers

Step 1 combines two different behaviors in one `test(...)`: `suppressFreshTrustHeader()` legacy-only stripping and `stripTrustHeader()` compact/legacy stripping. Split it into focused tests.

Use the actual current APIs in `src/output/read-only-ceremony.ts`:

```ts
import { stripTrustHeader, suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
```

Recommended structure:

```ts
test("suppressFreshTrustHeader leaves compact freshness headers untouched", () => {
  expect(suppressFreshTrustHeader("Trust: fresh\nbody\n")).toBe("Trust: fresh\nbody\n");
  expect(suppressFreshTrustHeader("Trust: partial\n- changed files: src/a.ts\nbody\n")).toBe(
    "Trust: partial\n- changed files: src/a.ts\nbody\n",
  );
});

test("stripTrustHeader removes compact freshness headers", () => {
  expect(stripTrustHeader("Trust: fresh\nbody\n")).toBe("body\n");
  expect(stripTrustHeader("Trust: unknown\n- deleted files: src/a.ts\n- recommendation: refresh index before relying on this result\nbody\n")).toBe("body\n");
});

test("stripTrustHeader still removes legacy trust blocks", () => {
  const legacy = ["## Trust", "status: stale", "evidence: tree-sitter  stale-files: 1/2", "body", ""].join("\n");
  expect(stripTrustHeader(legacy)).toBe("body\n");
});
```

## Task 3: Report symbol graph freshness

### Fix result scope collection

The proposed `collectSymbolGraphScope()` over-collects all graph neighbors and all neighbor edges:

```ts
for (const neighbor of params.store.getNeighbors(node.id)) {
  if (!neighbor.node.file.startsWith("__meta__") && !neighbor.node.file.startsWith("__unresolved__")) {
    resultNodes.set(neighbor.node.id, neighbor.node);
  }
  resultEdges.push(neighbor.edge);
}
```

That violates AC 1 because the freshness report must be computed from the requested target and returned result items, not every stored neighbor. It can mark output `partial` because of a stale neighbor omitted by the renderer's limit.

Revise Step 3 so the freshness scope matches the rows actually rendered. For neighborhood output, reuse the same ranking/limit semantics as `renderLegacyNeighborhoodBody()` instead of pushing every neighbor. A safe shape is:

```ts
function collectVisibleNeighborhoodScope(params: SymbolGraphParams, node: GraphNode): {
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const limit = params.limit ?? 10;
  const buckets = new Map<string, NeighborResult[]>();
  const unresolvedResults: NeighborResult[] = [];

  for (const nr of params.store.getNeighbors(node.id)) {
    if (nr.node.file.startsWith("__meta__")) continue;
    if (nr.node.file.startsWith("__unresolved__")) {
      unresolvedResults.push(nr);
      continue;
    }
    const direction = nr.edge.target === node.id ? "in" : "out";
    const title = sectionTitle(nr.edge.kind, direction);
    const bucket = buckets.get(title) ?? [];
    bucket.push(nr);
    buckets.set(title, bucket);
  }

  const visible = [
    ...[...buckets.values()].flatMap((bucket) => rankNeighbors(bucket, limit).kept),
    ...rankNeighbors(unresolvedResults, limit).kept,
  ];

  return {
    resultNodes: visible
      .filter((nr) => !nr.node.file.startsWith("__unresolved__"))
      .map((nr) => nr.node),
    resultEdges: visible.map((nr) => nr.edge),
  };
}
```

Then have `collectSymbolGraphScope()` include the target node plus only those visible nodes/edges for `include: ["neighborhood"]`. Add a regression test with more than the rendered limit where only an omitted neighbor is stale; expected output must stay `Trust: fresh` because the stale item was not returned.

### Update existing tests that will fail after the header format changes

Task 3 changes `symbolGraph()` from the legacy block:

```text
## Trust
status: fresh
```

to compact freshness lines:

```text
Trust: fresh
```

The task currently creates only `test/tool-symbol-graph-freshness-report.test.ts`, but `bun test` will fail existing symbol_graph tests that still expect `## Trust`. Update those tests in this task (or explicitly list them in `files_to_modify`) before claiming Step 5 passes. At minimum update these existing files:

- `test/tool-symbol-graph-trust-header.test.ts`
- `test/tool-symbol-graph-contract-include.test.ts`
- `test/extension-readonly-trust-gating.test.ts`
- `test/extension-suppress-trust-header-symbol-graph.test.ts`
- any other `symbol_graph` test found by `grep "## Trust|status: fresh|status: stale|status: mixed" test` that exercises `symbolGraph()` or the extension `symbol_graph` tool

Use expectations like:

```ts
expect(freshOutput.split("\n")[0]).toBe("Trust: fresh");
expect(partialOutput).toContain("Trust: partial");
expect(staleOutput).toContain("Trust: stale");
expect((withContract.match(/^Trust: /gm) ?? []).length).toBe(1);
```

For suppressed extension output, check both legacy and compact headers are absent:

```ts
expect(suppressedText.includes("## Trust")).toBe(false);
expect(suppressedText.includes("Trust: ")).toBe(false);
expect(suppressedText).toContain("## foo (function)");
```

Also update `test/extension-readonly-trust-gating.test.ts`: fresh public `symbol_graph` output should now begin with `Trust: fresh` per AC 2, not omit the header.

## Task 4: Warn on stale impact results

Task 4 changes `impact()` to compact freshness headers, but it only adds `test/tool-impact-freshness-warning.test.ts`. Existing impact tests still assert legacy trust headers and will fail in Step 5.

Update the existing impact tests in this task (or list them explicitly in `files_to_modify`). At minimum update:

- `test/tool-impact-trust-header.test.ts`
- `test/tool-impact-empty-symbols.test.ts`
- `test/tool-impact-empty-output.test.ts`
- `test/tool-impact-empty-diagnostic.test.ts`
- `test/tool-impact-083-repro.test.ts`
- `test/tool-impact-output-signals.test.ts`
- `test/tool-impact-performance.test.ts`
- `test/extension-impact.test.ts`
- `test/extension-suppress-trust-header-impact.test.ts`
- any other impact test found by `grep "## Trust|status: fresh|status: stale|status: mixed" test`

For example, in `test/tool-impact-trust-header.test.ts`, replace the legacy expectations:

```ts
expect(freshLines[0]).toBe("## Trust");
expect(freshLines[1]).toBe("status: fresh");
// ...
expect(staleLines[0]).toBe("## Trust");
expect(staleLines[1]).toBe("status: stale");
```

with compact, result-scoped expectations:

```ts
expect(freshLines[0]).toBe("Trust: fresh");
expect(freshOutput).not.toContain("depth:1 [stale]");

expect(staleLines[0]).toBe("Trust: partial"); // shared target is fresh; returned caller dependency is stale
expect(staleOutput).toContain("changed files: src/caller.ts");
expect(staleOutput).toContain("stale edges: 1");
expect(staleOutput).toContain("impact may be incomplete; refresh index before relying on this result");
expect(staleOutput).toContain("depth:1 [stale]");
```

For suppressed extension output, assert both header forms are absent:

```ts
expect(suppressedText.includes("## Trust")).toBe(false);
expect(suppressedText.includes("Trust: ")).toBe(false);
```

## Task 5: Warn on unreliable coverage trace freshness

### Split the overloaded test case

Step 1 currently puts unresolved stored steps, stale trace steps, deleted files, and freshness warning text into one `test(...)`:

```ts
test("trace reports stale, deleted, and unresolved coverage trace freshness warnings", () => {
  // unresolved + stale + deleted scenarios
});
```

Split this into focused tests in the same file, for example:

```ts
test("trace reports unknown freshness for unresolved stored coverage steps", () => { /* unresolved step only */ });
test("trace reports changed files and row-level stale markers for stale stored trace steps", () => { /* mutate app.ts */ });
test("trace reports deleted files for stored trace steps whose files were removed", () => { /* unlink app.ts */ });
```

Keep using the real APIs shown in the task: `SqliteGraphStore`, `store.saveTestTrace(...)`, `trace({ entry, file, store, projectRoot })`, and `sha256Hex()`.

### Update existing trace tests that will fail after the header format changes

Task 5 changes `trace()` from legacy trust statuses like `heuristic` / `runtime-backed` to compact result-scoped freshness. Existing trace tests still assert `## Trust` and `status: heuristic` / `status: runtime-backed`, so `bun test` will fail unless those tests are updated.

Update these existing files in this task (or list them explicitly in `files_to_modify`):

- `test/tool-trace-trust-heuristic.test.ts`
- `test/tool-trace-trust-runtime.test.ts`
- `test/tool-trace-static-mode-header.test.ts`
- `test/tool-trace-signals.test.ts`
- `test/extension-suppress-trust-header-trace.test.ts`
- `test/extension-suppress-trust-header-interactions.test.ts`
- the trace portions of `test/extension-readonly-trust-gating.test.ts`
- any other trace test found by `grep "## Trust|status: heuristic|status: runtime-backed|status: mixed" test`

Use compact expectations such as:

```ts
expect(lines[0]).toBe("Trust: fresh");
expect(output).toContain("mode: static (heuristic, no runtime evidence)");
```

For degraded coverage/static trace output, use:

```ts
expect(output).toContain("Trust: unknown"); // unresolved stored steps
expect(output).toContain("Trust: partial"); // stale returned static edge with fresh target
expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
```

For suppressed extension output, assert both legacy and compact headers are absent while the body remains:

```ts
expect(suppressedText.includes("## Trust")).toBe(false);
expect(suppressedText.includes("Trust: ")).toBe(false);
expect(suppressedText).toContain("mode: static (heuristic, no runtime evidence)");
```

Also update `test/extension-readonly-trust-gating.test.ts`: a fresh trace result should now start with `Trust: fresh` per AC 2, not `## Trust\nstatus: heuristic`.
