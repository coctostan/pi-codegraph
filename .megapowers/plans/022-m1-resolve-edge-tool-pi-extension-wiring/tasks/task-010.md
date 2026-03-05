---
id: 10
title: Pi extension registers symbol_graph tool with TypeBox schema
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-wiring.test.ts
---

### Task 10: Pi extension registers symbol_graph tool with TypeBox schema [depends: 6]

Covers AC 14 only.

**Files:**
- Test: `test/extension-wiring.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**
```typescript
// test/extension-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers symbol_graph tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const sgTool = registeredTools.find((t) => t.name === "symbol_graph");
  expect(sgTool).toBeDefined();

  const schema = sgTool!.parameters as any;
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("name");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` because `symbol_graph` is not registered yet

**Step 3 — Write minimal implementation**
```typescript
// src/index.ts
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute() {
      return { content: [{ type: "text", text: "not implemented" }] };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
