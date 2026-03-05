---
id: 11
title: Pi extension registers resolve_edge tool with TypeBox schema
status: approved
depends_on:
  - 10
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-wiring.test.ts
files_to_create: []
---

### Task 11: Pi extension registers resolve_edge tool with TypeBox schema [depends: 10]

Covers AC 15.

**Files:**
- Test: `test/extension-wiring.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**
```typescript
// Append to test/extension-wiring.test.ts
test("pi extension registers resolve_edge tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const reTool = registeredTools.find((t) => t.name === "resolve_edge");
  expect(reTool).toBeDefined();

  const schema = reTool!.parameters as any;
  expect(schema.properties.source).toBeDefined();
  expect(schema.properties.target).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.properties.evidence).toBeDefined();
  expect(schema.required).toContain("source");
  expect(schema.required).toContain("target");
  expect(schema.required).toContain("kind");
  expect(schema.required).toContain("evidence");
  expect(schema.properties.sourceFile).toBeDefined();
  expect(schema.properties.targetFile).toBeDefined();
  expect(schema.required).not.toContain("sourceFile");
  expect(schema.required).not.toContain("targetFile");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` because `resolve_edge` is not registered yet

**Step 3 — Write minimal implementation**
```typescript
// src/index.ts
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});

const ResolveEdgeParams = Type.Object({
  source: Type.String(),
  target: Type.String(),
  kind: Type.String(),
  evidence: Type.String(),
  sourceFile: Type.Optional(Type.String()),
  targetFile: Type.Optional(Type.String()),
});

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute() {
      return {
        content: [{ type: "text", text: "not implemented" }],
        details: undefined,
      };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an edge in the symbol graph with evidence",
    parameters: ResolveEdgeParams,
    async execute() {
      return {
        content: [{ type: "text", text: "not implemented" }],
        details: undefined,
      };
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
