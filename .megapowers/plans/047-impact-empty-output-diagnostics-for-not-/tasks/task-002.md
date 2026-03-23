---
id: 2
title: Fix addition change type returning empty body in impact()
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create: []
---

### Task 2: Fix addition change type returning empty body in impact()

**Files:**
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-empty-output.test.ts`

**Step 1 — Write the failing test**

The failing test already exists in `test/tool-impact-empty-output.test.ts` (written during reproduction). It is the second test in the file:

```typescript
// test/tool-impact-empty-output.test.ts — second test (already exists, lines 47-70)
test("impact() returns diagnostic message for addition change type (#043)", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["shared"],
      changeType: "addition",
      store,
      projectRoot,
      maxDepth: 5,
    });
    // Should contain the trust header
    expect(out).toContain("## Trust");
    // Must contain a message explaining that addition analysis isn't supported
    // or at least some non-empty body beyond the trust header
    const bodyAfterTrust = out.split("\n").filter(line => !line.startsWith("##") && line.trim() !== "");
    const hasNonHeaderContent = bodyAfterTrust.some(line =>
      !line.startsWith("status:") && !line.startsWith("evidence:")
    );
    expect(hasNonHeaderContent).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-output.test.ts -t "addition change type"`

Expected: FAIL — `error: expect(received).toBe(expected)` — Expected: `true`, Received: `false`

**Step 3 — Write minimal implementation**

In `src/tools/impact.ts`, in the `impact()` function, add an early return for `addition` change type before calling `collectImpactDetails`. Insert after line 149 (closing `}` of the symbol resolution loop) and before line 151 (the `createSignalComputer` line):

```typescript
  if (params.changeType === "addition") {
    return prependTrustHeader(
      `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood\n`,
      { stats },
    );
  }
```

The full `impact()` function from line 131 onwards will look like:

```typescript
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return prependTrustHeader(resolved.text, { stats });
    if (resolved.kind === "not_found") return prependTrustHeader(resolved.text, { stats });
  }

  if (params.changeType === "addition") {
    return prependTrustHeader(
      `addition: impact analysis for additions is not yet supported — use symbol_graph to inspect the new symbol's neighborhood\n`,
      { stats },
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

  if (hits.length === 0) return prependTrustHeader("", { stats });

  let hasLocalExceptions = false;
  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    if (stale) hasLocalExceptions = true;
    const why = formatImpactWhy(hit.signals, hit.chainConfidence);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}  ${why}`];
  });

  const body = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

Note: The addition check is placed AFTER the symbol resolution loop so that non-existent symbols still get the not_found diagnostic even when changeType is "addition". And it's placed BEFORE the `collectImpactDetails` call so we skip unnecessary computation.

The existing test at `test/extension-impact.test.ts:50-52` asserts the addition output contains `## Trust` and does NOT contain `"caller"`. The new diagnostic message satisfies both assertions.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-output.test.ts -t "addition change type"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing (including `extension-impact.test.ts` which tests addition output format)
