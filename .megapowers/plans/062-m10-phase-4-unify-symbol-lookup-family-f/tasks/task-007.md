---
id: 7
title: Remove standalone symbol_card and symbol_contract registrations
status: approved
depends_on:
  - 1
  - 4
  - 5
  - 6
no_test: false
files_to_modify:
  - src/index.ts
  - test/tool-symbol-card-wiring.test.ts
  - test/tool-symbol-contract-wiring.test.ts
  - test/extension-tool-descriptions.test.ts
  - tests/ptc-metadata.test.ts
  - test/token-tracker-wiring-check.test.ts
  - test/tool-symbol-graph-default-card.test.ts
  - test/tool-symbol-graph-legacy-neighborhood.test.ts
files_to_create: []
---

### Task 7: Remove standalone symbol_card and symbol_contract registrations [depends: 1, 4, 5, 6]

Covers AC 1, AC 19, AC 22.

**Scope note (responds to review):**
The previous version only asserted registration metadata, which did not prove AC 19 ("output contains no deprecation warnings or migration ceremony"). This revision extends the default-card and legacy-neighborhood test files from Tasks 3 and 4 with explicit negative output assertions so AC 19 is covered for both default and include-driven `symbol_graph` usage.
**Files:**
- Modify: `src/index.ts`
- Modify: `test/tool-symbol-card-wiring.test.ts`
- Modify: `test/tool-symbol-contract-wiring.test.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `tests/ptc-metadata.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/tool-symbol-graph-default-card.test.ts` (extend for AC 19)
- Modify: `test/tool-symbol-graph-legacy-neighborhood.test.ts` (extend for AC 19)
**Step 1 — Write the failing test**
Replace `test/tool-symbol-card-wiring.test.ts` with:
```ts
import { expect, test } from "bun:test";

test("pi extension no longer registers symbol_card and keeps internal renderers exported", async () => {
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  const symbolCardMod = await import("../src/tools/symbol-card.js");
  piCodegraph(mockPi as any);
  expect(registeredTools.find((t) => t.name === "symbol_card")).toBeUndefined();
  expect(typeof (symbolCardMod as any).renderSymbolCardBody).toBe("function");
  expect(typeof (symbolCardMod as any).renderSymbolSourceSection).toBe("function");
});
```

Replace `test/tool-symbol-contract-wiring.test.ts` with:

```ts
import { expect, test } from "bun:test";

test("pi extension no longer registers symbol_contract and keeps renderSymbolContractBody exported", async () => {
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  const symbolContractMod = await import("../src/tools/symbol-contract.js");
  piCodegraph(mockPi as any);
  expect(registeredTools.find((t) => t.name === "symbol_contract")).toBeUndefined();
  expect(typeof (symbolContractMod as any).renderSymbolContractBody).toBe("function");
});
```

Update `test/extension-tool-descriptions.test.ts` so the expected default public tools are exactly:

```ts
const expected = new Map<string, string>([
  ["symbol_graph", "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol."],
  ["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."],
  ["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."],
  ["impact", "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code."],
  ["trace", "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs."],
]);
```

Update `tests/ptc-metadata.test.ts` so `READ_ONLY_TOOLS` becomes:

```ts
const READ_ONLY_TOOLS = [
  "symbol_graph",
  "impact",
  "trace",
  "graph_query",
  "graph_overview",
  "dead_code",
];
```

Update `test/token-tracker-wiring-check.test.ts` so `expected` becomes:

```ts
const expected = [
  "symbol_graph",
  "trace",
  "impact",
  "resolve_edge",
  "delete_edge",
];
```

**AC 19 output assertions.** Extend the existing `test/tool-symbol-graph-default-card.test.ts` default-card test (from Task 3) with these negative assertions **inside** the main test block, immediately after the existing `expect(withoutInclude).not.toContain("### Source")` line:

```ts
    expect(withoutInclude.toLowerCase()).not.toContain("deprecated");
    expect(withoutInclude).not.toContain("use symbol_graph instead");
    expect(withoutInclude).not.toContain("symbol_card(");
    expect(withoutInclude).not.toContain("symbol_contract(");
```

And extend `test/tool-symbol-graph-legacy-neighborhood.test.ts` (from Task 4) — inside the `include:['neighborhood']` test, after the `expect(neighborhood).toBe(expected)` line — with:

```ts
    expect(neighborhood.toLowerCase()).not.toContain("deprecated");
    expect(neighborhood).not.toContain("use symbol_graph instead");
    expect(neighborhood).not.toContain("symbol_card(");
    expect(neighborhood).not.toContain("symbol_contract(");
```

This extension is what proves AC 19 for both the default compact card and the legacy neighborhood base.
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts tests/ptc-metadata.test.ts test/token-tracker-wiring-check.test.ts`
Expected: FAIL — the two wiring tests report `expect(received).toBeUndefined()` because `symbol_card` / `symbol_contract` are still registered in `src/index.ts`, and `test/extension-tool-descriptions.test.ts` throws `Error: registered tool list mismatch: ...` because the default public tool list is still 7 tools. `tests/ptc-metadata.test.ts` and `test/token-tracker-wiring-check.test.ts` are expected to stay green at this step because they do not fail on extra registrations.
**Step 3 — Write minimal implementation**
In `src/index.ts`:


1. Remove the `symbolCard` and `symbolContract` imports at the top of the file.
2. Delete the `SymbolCardParams` and `SymbolContractParams` schema blocks.
3. Delete the `registerReadOnlyTool(pi, { name: "symbol_card", ... })` block.
4. Delete the `registerReadOnlyTool(pi, { name: "symbol_contract", ... })` block.
5. Keep `symbol_graph` registered, keep `resolve_edge`, `delete_edge`, `impact`, and `trace` unchanged, and keep the internal renderer exports in `src/tools/symbol-card.ts` / `src/tools/symbol-contract.ts` intact.
Do not add any deprecation warning string to `symbol_graph` output. The AC 19 assertions extended into the Task 3 and Task 4 test files (see Step 1) already lock this invariant.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-wiring.test.ts test/tool-symbol-contract-wiring.test.ts test/extension-tool-descriptions.test.ts tests/ptc-metadata.test.ts test/token-tracker-wiring-check.test.ts test/tool-symbol-graph-default-card.test.ts test/tool-symbol-graph-legacy-neighborhood.test.ts`
Expected: PASS
**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
