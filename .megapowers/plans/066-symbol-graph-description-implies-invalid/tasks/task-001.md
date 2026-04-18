---
id: 1
title: Clarify the registered symbol_graph contract
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-tool-descriptions.test.ts
files_to_create: []
---

### Task 1: Clarify the registered symbol_graph contract

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-tool-descriptions.test.ts`

**Step 1 — Write the failing test**
Use the existing default export signature from `src/index.ts` (`piCodegraph(pi: ExtensionAPI): void`) and the existing `SymbolGraphParams` schema shape when registering the mock extension. Replace `test/extension-tool-descriptions.test.ts` with:

```ts
import { test } from "bun:test";

test("pi extension registers the approved descriptions for the 5 default public tools", async () => {
  const expected = new Map<string, string>([
    [
      "symbol_graph",
      "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
    ],
    [
      "resolve_edge",
      "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs.",
    ],
    [
      "delete_edge",
      "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete.",
    ],
    [
      "impact",
      "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
    ],
    [
      "trace",
      "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
    ],
  ]);
  const expectedIncludeDescription =
    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';

  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default(mockPi as any);

  const names = registeredTools.map((tool) => tool.name).sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`registered tool list mismatch: ${names.join(",")}`);
  }

  for (const tool of registeredTools) {
    if (!tool.description.trim()) {
      throw new Error(`empty description for ${tool.name}`);
    }
    const wanted = expected.get(tool.name);
    if (!wanted) {
      throw new Error(`unexpected tool registered: ${tool.name}`);
    }
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }

  const symbolGraph = registeredTools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraph) {
    throw new Error("symbol_graph was not registered");
  }

  const includeDescription = symbolGraph.parameters?.properties?.include?.description;
  if (includeDescription !== expectedIncludeDescription) {
    throw new Error(`symbol_graph include description mismatch: ${includeDescription}`);
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-tool-descriptions.test.ts`
Expected: FAIL — `error: description mismatch for symbol_graph: Return a symbol's callers, callees, tests, and key signals.` followed by `When to use: You need structural context for a named symbol.`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the current `SymbolGraphParams` block and `symbol_graph` description string with:

```ts
const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  include: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("neighborhood"),
        Type.Literal("contract"),
        Type.Literal("source"),
      ]),
      {
        description:
          'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.',
      },
    ),
  ),
});
```

```ts
  registerReadOnlyTool(pi, {
    name: "symbol_graph",
    label: "Symbol Graph",
    description:
      "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
    parameters: SymbolGraphParams,
```

Do not change `symbolGraph()` behavior in `src/tools/symbol-graph.ts`; this task is only fixing the registered surface contract.

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-tool-descriptions.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

## Execution notes
- Replaced `test/extension-tool-descriptions.test.ts` with the planned regression test and confirmed RED on `bun test test/extension-tool-descriptions.test.ts` with the expected `description mismatch for symbol_graph` failure.
- Updated `src/index.ts` so the registered `symbol_graph` description now matches the approved compact summary wording and the `include` parameter description explicitly lists the only valid values.
- Verified GREEN with `bun test test/extension-tool-descriptions.test.ts` and then ran the full suite with `bun test` (`444 pass, 0 fail`).