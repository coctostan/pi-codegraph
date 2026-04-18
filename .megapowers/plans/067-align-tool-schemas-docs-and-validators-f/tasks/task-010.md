---
id: 10
title: "Lock symbol_graph.include wording/schema (regression guard for #066)"
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/symbol-graph-include-lock.test.ts
---

Covers AC 18.

**Files:**
- Create: `test/symbol-graph-include-lock.test.ts`

**Step 1 — Write the failing test**

Create `test/symbol-graph-include-lock.test.ts`:

```ts
import { test } from "bun:test";

test("symbol_graph.include wording and literal set from #066 are unchanged", async () => {
  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      registeredTools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
  (mod as any).default(mockPi as any);

  const sg = registeredTools.find((t) => t.name === "symbol_graph");
  if (!sg) throw new Error("symbol_graph not registered");

  const include = sg.parameters?.properties?.include;
  if (!include) throw new Error("symbol_graph.include schema missing");

  const expectedDescription =
    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';
  if (include.description !== expectedDescription) {
    throw new Error(`symbol_graph.include description drifted: ${include.description}`);
  }

  const items = include.items;
  const literals: unknown[] = Array.isArray(items?.anyOf) ? items.anyOf.map((x: any) => x.const) : [];
  const expectedLiterals = ["neighborhood", "contract", "source"];
  if (JSON.stringify(literals) !== JSON.stringify(expectedLiterals)) {
    throw new Error(`symbol_graph.include item literals drifted: ${JSON.stringify(literals)}`);
  }
});
```

**Step 2 — Run test, verify it fails (or passes as a lock-in)**

Run: `bun test test/symbol-graph-include-lock.test.ts`

Expected: PASS — this is a lock-in for #066 wording already in place. If any prior task accidentally touched `SymbolGraphParams.include`, the runner will print `symbol_graph.include description drifted: ...` or `symbol_graph.include item literals drifted: [...]`. Fix by reverting that area of `src/index.ts`.

**Step 3 — Write minimal implementation**

No production code change expected. If the lock-in fires, restore `SymbolGraphParams.include` in `src/index.ts` to:

```ts
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
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/symbol-graph-include-lock.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
