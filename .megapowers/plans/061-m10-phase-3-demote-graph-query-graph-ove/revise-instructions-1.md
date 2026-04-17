## Task 4: Add symbol_graph include schema without changing default output

Step 1 does not actually lock the pre-change `symbol_graph` output. Comparing `include: []` to the omitted case only proves those two post-change paths match each other. It does **not** prove AC 8 / AC 19 (`default output is unchanged`) because both paths could change together.

Keep the schema assertions, but add an exact default-output assertion for the current unique-symbol fixture before the `include: []` comparison. Use the existing `computeAnchor()` helper so you do not have to hardcode the line hash.

Add this import in `test/tool-symbol-graph-include-schema.test.ts`:

```ts
import { computeAnchor } from "../src/output/anchoring.js";
```

Then replace the output assertions with:

```ts
const node = store.findNodes("foo")[0]!;
const anchor = computeAnchor(node, projectRoot).anchor;

const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
expect(withoutInclude).toBe(
  `## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n## foo (function)\n${anchor}\n`,
);

const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
expect(withEmptyInclude).toBe(withoutInclude);
```

That gives you an actual regression lock for the current default output, while still proving `include: []` is byte-identical to the omitted path.

## Task 5: Append shared contract output from symbol_graph include

There are two blockers here.

### 1. Step 1 does not prove the appended content matches the standalone `symbol_contract` path

Right now the test compares `symbol_graph` against `renderSymbolContractBody()` directly. That proves the helper exists, but it does **not** prove the standalone `symbol_contract()` tool is using the same rendering path. AC 10 / AC 19 require the shared path to be the actual source of truth.

In `test/tool-symbol-graph-contract-include.test.ts`, add this import:

```ts
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
```

Keep the exported-helper assertion if you want the failure in Step 2 to stay stable, but compare the appended section to the standalone tool output with the trust header stripped.

Use this shape for the main test:

```ts
const renderSymbolContractBody = (symbolContractTool as any).renderSymbolContractBody as
  | ((params: { name: string; file?: string; store: SqliteGraphStore; projectRoot: string }) => { body: string; hasLocalExceptions: boolean })
  | undefined;

if (typeof renderSymbolContractBody !== "function") {
  throw new Error("renderSymbolContractBody is not exported from symbol-contract");
}

const { projectRoot, store, cleanup } = setupContractFixture();
try {
  const base = symbolGraph({ name: "validate", store, projectRoot });
  const rendered = renderSymbolContractBody({ name: "validate", store, projectRoot });
  const standaloneBody = suppressFreshTrustHeader(
    symbolContractTool.symbolContract({ name: "validate", store, projectRoot }),
  );
  const withContract = symbolGraph({ name: "validate", include: ["contract"] as any, store, projectRoot });

  expect(standaloneBody).toBe(rendered.body);
  expect(withContract.startsWith(base)).toBe(true);
  expect(withContract.slice(base.length)).toBe(`\n${standaloneBody}`);
  expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
} finally {
  cleanup();
}
```

That verifies:
- the helper exists,
- the standalone `symbol_contract()` output matches the helper body,
- `symbol_graph(include:["contract"])` appends that exact standalone contract body after the unchanged neighborhood output.

### 2. Step 3 leaves the current early returns in place, which cannot satisfy AC 11

The instruction `Leave the existing early returns for not-found and ambiguous symbols in place` is wrong for this issue. In the current `src/tools/symbol-graph.ts`, the early returns at the top of `symbolGraph()` return before any contract section can be appended. That means `include: ["contract"]` cannot append the shared empty-state contract body for missing symbols.

Refactor `symbolGraph()` so every branch builds `body` + `hasLocalExceptions`, and the contract section is appended **after** the main body is computed, before the final `prependTrustHeader()` call.

Use this structure in `src/tools/symbol-graph.ts`:

```ts
export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, include, limit = 10, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  let body: string;
  let hasLocalExceptions = false;

  if (nodes.length === 0) {
    body = `Symbol "${name}" not found`;
  } else if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    body = `${lines.join("\n")}\n`;
    hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
  } else {
    const node = nodes[0]!;
    const symbolAnchor = computeAnchor(node, projectRoot);
    const signalComputer = createSignalComputer(store);
    const allNeighbors = store.getNeighbors(node.id);
    const computeSignals = (nodeId: string) => signalComputer.compute(nodeId);

    // keep the existing neighborhood bucketing/ordering logic unchanged here

    body = formatNeighborhood(
      { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
      namedSections,
    );

    hasLocalExceptions =
      symbolAnchor.stale || namedSections.some((ns) => hasStaleItems(ns.section));
  }

  if (include?.includes("contract")) {
    const rendered = renderSymbolContractBody({ name, file, store, projectRoot });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
    hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
  }

  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

That is the only way to keep the main `symbol_graph` output intact **and** still append the shared contract empty state when the symbol is missing.

Also strengthen the missing-symbol test. The current assertion:

```ts
expect(output).toContain('Symbol "doesNotExist" not found');
```

is too weak; it passes even if no contract section is appended. Replace it with an exact suffix check against the stripped standalone `symbol_contract` output:

```ts
const base = symbolGraph({ name: "doesNotExist", store, projectRoot });
const standaloneBody = suppressFreshTrustHeader(
  symbolContractTool.symbolContract({ name: "doesNotExist", store, projectRoot }),
);
const withContract = symbolGraph({ name: "doesNotExist", include: ["contract"] as any, store, projectRoot });

expect(withContract.startsWith(base)).toBe(true);
expect(withContract.slice(base.length)).toBe(`\n${standaloneBody}`);
```

Keep Step 2 aligned with the helper-export assertion (`renderSymbolContractBody is not exported from symbol-contract`) if you keep that assertion at the top of the first test.
