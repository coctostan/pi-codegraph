## Task 2: Strip compact freshness headers

Task 2 currently contradicts AC 2. The spec requires fresh public outputs to begin with `Trust: fresh` when `suppressTrustHeader` is not enabled. Do **not** make `suppressFreshTrustHeader("Trust: fresh\nbody\n")` strip compact fresh headers.

Revise Step 1 so compact fresh is preserved by `suppressFreshTrustHeader` and removed only by `stripTrustHeader`:

```ts
expect(suppressFreshTrustHeader("Trust: fresh\nbody\n")).toBe("Trust: fresh\nbody\n");
expect(suppressFreshTrustHeader("Trust: partial\n- changed files: src/a.ts\nbody\n")).toBe("Trust: partial\n- changed files: src/a.ts\nbody\n");
expect(stripTrustHeader("Trust: fresh\nbody\n")).toBe("body\n");
expect(stripTrustHeader("Trust: partial\n- changed files: src/a.ts\n- recommendation: refresh index before relying on this result\nbody\n")).toBe("body\n");
```

Revise Step 3 to leave `suppressFreshTrustHeader` as legacy-only `## Trust/status: fresh` stripping and add compact stripping only to `stripTrustHeader`:

```ts
function stripCompactTrustHeader(lines: string[]): string | null {
  if (!lines[0]?.startsWith("Trust: ")) return null;
  let bodyStart = 1;
  while (bodyStart < lines.length && (lines[bodyStart] ?? "").startsWith("- ")) {
    bodyStart++;
  }
  return lines.slice(bodyStart).join("\n");
}

export function suppressFreshTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (lines[1] !== "status: fresh") return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}

export function stripTrustHeader(text: string): string {
  const lines = text.split("\n");
  const compact = stripCompactTrustHeader(lines);
  if (compact !== null) return compact;
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (!(lines[1] ?? "").startsWith("status: ")) return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

## Task 3: Report symbol graph freshness

Step 3 is not self-contained enough for the plan quality bar. It gives snippets but not exact complete edits. Revise Step 3 to include concrete code that compiles in the real file.

Use real types instead of `any` in the new helper. `src/tools/symbol-graph.ts` already imports `GraphStore, NeighborResult`; add `GraphEdge, GraphNode` type imports from `../graph/types.js` or use existing types precisely:

```ts
import type { GraphEdge, GraphNode } from "../graph/types.js";
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
```

The helper should be fully specified:

```ts
function collectSymbolGraphScope(params: SymbolGraphParams): {
  targetNodes: GraphNode[];
  resultNodes: GraphNode[];
  resultEdges: GraphEdge[];
} {
  const resolvedNodes = params.store.findNodes(params.name, params.file);
  const targetNodes = resolvedNodes.length === 1 ? [resolvedNodes[0]!] : [];
  const resultNodes = new Map<string, GraphNode>();
  const resultEdges: GraphEdge[] = [];

  for (const node of resolvedNodes) resultNodes.set(node.id, node);
  if (resolvedNodes.length === 1) {
    const node = resolvedNodes[0]!;
    for (const neighbor of params.store.getNeighbors(node.id)) {
      if (!neighbor.node.file.startsWith("__meta__") && !neighbor.node.file.startsWith("__unresolved__")) {
        resultNodes.set(neighbor.node.id, neighbor.node);
      }
      resultEdges.push(neighbor.edge);
    }
  }

  return { targetNodes, resultNodes: [...resultNodes.values()], resultEdges };
}
```

Also explicitly say to remove the now-unused `const stats = params.store.getStatistics(params.projectRoot);` and replace the final `prependTrustHeader(...)` return with `prependFreshnessHeader(...)`.

## Task 4: Warn on stale impact results

Step 3 is too ambiguous. It says "Replace each `prependTrustHeader(...)` call" but does not show where the helper belongs or how validation paths use it. Revise it to provide a complete replacement for `impact(...)` or exact before/after blocks for every return path.

The real signature is:

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string
```

The revised instructions must make clear that `targetNodes` and `withFreshness` are declared before any early return that uses them:

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const targetNodes = (params.symbols ?? []).flatMap((symbol) => params.store.findNodes(symbol));
  const withFreshness = (body: string, resultNodes = targetNodes, resultEdges: NeighborResult["edge"][] = []) => prependFreshnessHeader(
    body,
    evaluateFreshness({
      store: params.store,
      projectRoot: params.projectRoot,
      targetNodes,
      resultNodes,
      resultEdges,
      recommendation: "impact may be incomplete; refresh index before relying on this result",
    }),
  );

  // all early returns use withFreshness(...)
}
```

Keep the `ImpactDetail` addition, but show the exact object field added in `collectImpactDetails`:

```ts
edge: neighbor.edge,
```

## Task 5: Warn on unreliable trace freshness

Task 5 claims to cover AC 10, but it does not test stale static call edges. AC 10 explicitly requires warnings when stale call edges may make the execution path unreliable. Add coverage for static trace call-edge staleness, either by revising Task 5 or by adding a new separate task before the final end-to-end task.

A focused test case should create a static `calls` edge whose source file is fresh but whose edge provenance hash is stale:

```ts
store.addNode({ id: "src/app.ts::entry:1", kind: "function", name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: appHash, is_exported: true });
store.addNode({ id: "src/app.ts::leaf:2", kind: "function", name: "leaf", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: appHash, is_exported: true });
store.addEdge({
  source: "src/app.ts::entry:1",
  target: "src/app.ts::leaf:2",
  kind: "calls",
  provenance: { source: "tree-sitter", confidence: 0.8, evidence: "entry calls leaf", content_hash: "old-edge-hash" },
  created_at: 1,
});
```

Then assert:

```ts
const output = trace({ entry: "entry", store, projectRoot });
expect(output).toContain("Trust: partial");
expect(output).toContain("stale edges: 1");
expect(output).toContain("trace path may be unreliable; refresh index before relying on this result");
expect(output).toContain("mode: static (heuristic, no runtime evidence) [stale]");
```

The implementation must pass result edges into the evaluator. The current proposed `traceFreshness(...)` only accepts `nodeIds` and `unresolvedItems`; revise it to accept edges:

```ts
function traceFreshness(
  params: TraceParams,
  targetNode: GraphNode,
  nodeIds: string[],
  unresolvedItems: string[] = [],
  resultEdges: GraphEdge[] = [],
) {
  const resultNodes = nodeIds.flatMap((id) => {
    const node = params.store.getNode(id);
    return node ? [node] : [];
  });
  return evaluateFreshness({
    store: params.store,
    projectRoot: params.projectRoot,
    targetNodes: [targetNode],
    resultNodes: [targetNode, ...resultNodes],
    resultEdges,
    unresolvedItems,
    recommendation: "trace path may be unreliable; refresh index before relying on this result",
  });
}
```

For static traces, collect the `calls` edges along the returned path and use the freshness status when rendering `formatModeHeader(...)` so stale edges set the mode header to `[stale]` even when all node anchors are fresh.

Also revise Step 3 to be self-contained. Avoid placeholders like `staticSteps.map(...)`; show the actual code that computes node IDs, steps, freshness, and the final return.

## Task 6: Verify compact suppress behavior end to end

Task 6 is not valid TDD as written. It depends on Tasks 2–5, so its Step 2 should not fail after dependencies are complete. It also has no concrete Step 3 implementation.

Revise this task in one of these ways:

1. Convert it into a final `[no-test]` verification task that does not create a new test file and only runs:

```bash
bun test && bun run check
```

with justification `final verification only`; or

2. Move the end-to-end suppression test into the task that actually implements compact `stripTrustHeader` behavior, so Step 2 fails before the `stripTrustHeader` implementation and Step 3 contains the concrete `read-only-ceremony.ts` code that makes it pass.

Do not leave a task whose expected failure only occurs "before Tasks 2–5 are complete" while the task itself depends on Tasks 2–5.
