---
id: 7
title: Register symbol_card tool in pi extension entry
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/tool-symbol-card-wiring.test.ts
---

**Files:**
- Modify: `src/index.ts`
- Test: `test/tool-symbol-card-wiring.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers symbol_card tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const scTool = registeredTools.find((t) => t.name === "symbol_card");
  expect(scTool).toBeDefined();

  const schema = scTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-wiring.test.ts`
Expected: FAIL — expect(received).toBeDefined() — scTool is undefined

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```ts
import { symbolCard } from "./tools/symbol-card.js";
```

2. Add TypeBox params after `DeleteEdgeParams`:
```ts
const SymbolCardParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

3. Add tool registration inside `piCodegraph` function, after the `graph_query` registration:
```ts
  pi.registerTool({
    name: "symbol_card",
    label: "Symbol Card",
    description: "Return a compact symbol summary: definition, signature, tests, relationships, and signals",
    parameters: SymbolCardParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolCard({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
