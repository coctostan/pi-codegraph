---
id: 4
title: Warn on stale impact results
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - test/tool-impact-trust-header.test.ts
  - test/tool-impact-empty-symbols.test.ts
  - test/tool-impact-empty-output.test.ts
  - test/tool-impact-empty-diagnostic.test.ts
  - test/tool-impact-083-repro.test.ts
  - test/tool-impact-output-signals.test.ts
  - test/tool-impact-performance.test.ts
  - test/extension-impact.test.ts
  - test/extension-suppress-trust-header-impact.test.ts
files_to_create:
  - test/tool-impact-freshness-warning.test.ts
---

### Task 4: Warn on stale impact results [depends: 1, 2]

**Covers:** AC 2, AC 3, AC 9, AC 11, AC 13, AC 14

**Files:**
- Modify: `src/tools/impact.ts`
- Modify existing tests: `test/tool-impact-trust-header.test.ts`, `test/tool-impact-empty-symbols.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-empty-diagnostic.test.ts`, `test/tool-impact-083-repro.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-performance.test.ts`, `test/extension-impact.test.ts`, `test/extension-suppress-trust-header-impact.test.ts`
- Test: `test/tool-impact-freshness-warning.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-impact-freshness-warning.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { impact } from "../src/tools/impact.js";

test("impact reports stale dependency freshness warning for incomplete blast radius", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const shared = "export function shared() { return 1; }\n";
  const callerV1 = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  const callerV2 = "import { shared } from './shared';\nexport function caller() { return shared() + 1; }\n";
  writeFileSync(join(projectRoot, "src", "shared.ts"), shared);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerV1);
  const sharedHash = sha256Hex(shared);
  const callerHash = sha256Hex(callerV1);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: sharedHash, is_exported: true });
    store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: callerHash, is_exported: true });
    store.addEdge({ source: "src/caller.ts::caller:2", target: "src/shared.ts::shared:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: callerHash }, created_at: 1 });
    store.setFileHash("src/shared.ts", sharedHash);
    store.setFileHash("src/caller.ts", callerHash);

    const fresh = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot });
    expect(fresh.split("\n")[0]).toBe("Trust: fresh");

    writeFileSync(join(projectRoot, "src", "caller.ts"), callerV2);
    const stale = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot });
    expect(stale).toContain("Trust: partial");
    expect(stale).toContain("changed files: src/caller.ts");
    expect(stale).toContain("affected symbols: caller, shared");
    expect(stale).toContain("stale edges: 1");
    expect(stale).toContain("impact may be incomplete; refresh index before relying on this result");
    expect(stale).toContain("caller  breaking  depth:1 [stale]");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update existing impact tests in the same RED step so `bun test` expects compact freshness headers:

- In `test/tool-impact-trust-header.test.ts`, replace the legacy header assertions with:
  ```ts
  expect(freshLines[0]).toBe("Trust: fresh");
  expect(freshOutput).not.toContain("depth:1 [stale]");

  expect(staleLines[0]).toBe("Trust: partial");
  expect(staleOutput).toContain("changed files: src/caller.ts");
  expect(staleOutput).toContain("stale edges: 1");
  expect(staleOutput).toContain("impact may be incomplete; refresh index before relying on this result");
  expect(staleOutput).toContain("depth:1 [stale]");
  ```
- In `test/tool-impact-empty-symbols.test.ts`, replace each of the three `expect(out).toContain("## Trust")` lines with:
  ```ts
  expect(out).toContain("Trust: fresh");
  ```
- In `test/tool-impact-empty-output.test.ts`, replace both `expect(out).toContain("## Trust")` lines with:
  ```ts
  expect(out).toContain("Trust: fresh");
  ```
  In the addition-analysis test in that same file, also replace the legacy body filter:
  ```ts
  const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("##") && line.trim() !== "");
  const hasNonHeaderContent = bodyAfterTrust.some(line =>
    !line.startsWith("status:") && !line.startsWith("evidence:")
  );
  ```
  with compact-header filtering:
  ```ts
  const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("Trust:") && !line.startsWith("- ") && line.trim() !== "");
  const hasNonHeaderContent = bodyAfterTrust.length > 0;
  ```
- In `test/tool-impact-empty-diagnostic.test.ts`, replace the three `expect(out).toContain("## Trust")` lines with `expect(out).toContain("Trust: partial")` because those tests intentionally seed nodes with fake `content_hash: "h"` against real files.
- In `test/tool-impact-083-repro.test.ts`, replace both `expect(out).toContain("## Trust")` lines with `expect(out).toContain("Trust: partial")` for the same fake-hash reason.
- In `test/tool-impact-output-signals.test.ts`, replace `expect(out).toContain("## Trust")` with:
  ```ts
  expect(out).toContain("Trust: fresh");
  ```
- In `test/tool-impact-performance.test.ts`, replace `expect(output).toContain("## Trust")` with:
  ```ts
  expect(output).toContain("Trust: fresh");
  ```
- In `test/extension-impact.test.ts`, replace the two legacy assertions with:
  ```ts
  expect(out).toContain("Trust: fresh");
  expect(noImpact).toContain("Trust: fresh");
  ```
- In `test/extension-suppress-trust-header-impact.test.ts`, replace the stale-baseline and suppressed-header assertions with:
  ```ts
  expect(baselineText).toContain("Trust: stale");
  expect(suppressedText.includes("## Trust")).toBe(false);
  expect(suppressedText.includes("Trust: ")).toBe(false);
  expect(suppressedText).toContain("caller");
  ```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-freshness-warning.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` for `fresh.split("\n")[0]`: Expected: `"Trust: fresh"`; Received: `"## Trust"`

**Step 3 — Write minimal implementation**
Apply these exact edits to `src/tools/impact.ts`.

1. Replace the trust import:

```ts
import { evaluateFreshness, prependFreshnessHeader } from "../output/freshness.js";
```

2. Extend `ImpactDetail` with the edge that discovered the dependent:

```ts
export interface ImpactDetail extends ImpactItem {
  chainConfidence: number;
  signals: NodeSignals;
  edge: NeighborResult["edge"];
}
```

3. In `collectImpactDetails`, add the exact `edge` field to the object passed to `detailsByNode.set(...)`:

```ts
      detailsByNode.set(neighbor.node.id, {
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
        chainConfidence,
        signals: signalComputer.compute(neighbor.node.id, changedNodeIds),
        edge: neighbor.edge,
      });
```

4. Replace the entire existing `impact(...)` function with this complete implementation. It declares `targetNodes` and `withFreshness` before any early returns, and every return path uses the freshness wrapper:

```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const targetNodes = (params.symbols ?? []).flatMap((symbol) => params.store.findNodes(symbol));
  const withFreshness = (
    body: string,
    resultNodes = targetNodes,
    resultEdges: NeighborResult["edge"][] = [],
  ) => prependFreshnessHeader(
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

  // Defensive: validate symbols parameter (#065)
  if (!params.symbols || params.symbols.length === 0) {
    return withFreshness(
      "Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n",
    );
  }

  // Defensive: validate changeType (#065)
  const validChangeTypes: ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
  if (!validChangeTypes.includes(params.changeType)) {
    return withFreshness(
      `Error: Invalid changeType "${params.changeType}". Must be one of: ${validChangeTypes.join(", ")}\n`,
    );
  }

  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return withFreshness(resolved.text);
    if (resolved.kind === "not_found") return withFreshness(resolved.text);
  }

  if (params.changeType === "addition") {
    return withFreshness(
      `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood\n`,
    );
  }

  const signalComputer = createSignalComputer(params.store);
  const hits = collectImpactDetails({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
    signalComputer,
  });

  if (hits.length === 0) {
    const body = buildEmptyImpactDiagnostic(params.symbols, params.store, signalComputer, params.maxDepth ?? 5);
    return withFreshness(body);
  }

  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    const why = formatImpactWhy(hit.signals, hit.chainConfidence);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}  ${why}`];
  });

  const hitNodes = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    return node ? [node] : [];
  });
  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return withFreshness(body, [...targetNodes, ...hitNodes], hits.map((hit) => hit.edge));
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-freshness-warning.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
