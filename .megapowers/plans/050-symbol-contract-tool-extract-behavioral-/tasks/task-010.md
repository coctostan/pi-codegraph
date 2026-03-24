---
id: 10
title: Register symbol_contract tool in pi extension
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/tool-symbol-contract-wiring.test.ts
---

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-symbol-contract-wiring.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-contract-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers symbol_contract tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const scTool = registeredTools.find((t) => t.name === "symbol_contract");
  expect(scTool).toBeDefined();

  const schema = scTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-contract-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` because no `symbol_contract` tool is registered yet.

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at the top:
```typescript
import { symbolContract } from "./tools/symbol-contract.js";
```

2. Add params definition after `SymbolCardParams`:
```typescript
const SymbolContractParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

3. Add tool registration after the `symbol_card` registration block (before the closing of `piCodegraph` function):
```typescript
  pi.registerTool({
    name: "symbol_contract",
    label: "Symbol Contract",
    description: "Extract behavioral contract for a symbol: what it takes, returns, throws, and what tests assert about it",
    parameters: SymbolContractParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolContract({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-contract-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
