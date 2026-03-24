---
id: 9
title: Register delete_edge tool in pi extension
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-wiring.test.ts
files_to_create: []
---

Covers: AC 1 (tool registered in index.ts), AC 2 (accepts correct params), AC 9 (readonly error handling)

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-wiring.test.ts`

**Step 1 — Write the failing test**

Append to `test/extension-wiring.test.ts`:

```typescript
test("pi extension registers delete_edge tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const deTool = registeredTools.find((t) => t.name === "delete_edge");
  expect(deTool).toBeDefined();

  const schema = deTool!.parameters as any;
  expect(schema.properties.source).toBeDefined();
  expect(schema.properties.target).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.required).toContain("source");
  expect(schema.required).toContain("target");
  expect(schema.required).toContain("kind");
  expect(schema.properties.sourceFile).toBeDefined();
  expect(schema.properties.targetFile).toBeDefined();
  expect(schema.required).not.toContain("sourceFile");
  expect(schema.required).not.toContain("targetFile");
  // No evidence param (unlike resolve_edge)
  expect(schema.properties.evidence).toBeUndefined();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts -t "delete_edge"`
Expected: FAIL — `expect(received).toBeDefined()` because no `delete_edge` tool is registered yet.

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at the top:
```typescript
import { deleteEdge } from "./tools/delete-edge.js";
```

2. Add Typebox params after existing param definitions:
```typescript
const DeleteEdgeParams = Type.Object({
  source: Type.String({ description: "Source symbol name" }),
  target: Type.String({ description: "Target symbol name" }),
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
  sourceFile: Type.Optional(Type.String({ description: "Source file path to disambiguate" })),
  targetFile: Type.Optional(Type.String({ description: "Target file path to disambiguate" })),
});
```

3. Add tool registration inside `piCodegraph()`, after the `resolve_edge` registration block:
```typescript
  pi.registerTool({
    name: "delete_edge",
    label: "Delete Edge",
    description: "Delete an agent-created edge from the symbol graph",
    parameters: DeleteEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output: string;
      try {
        output = deleteEdge({
          source: params.source,
          target: params.target,
          sourceFile: params.sourceFile,
          targetFile: params.targetFile,
          kind: params.kind,
          store,
          projectRoot,
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("readonly")) {
          output = "Cannot delete edge: database is readonly. Re-index the project to enable writes.";
        } else {
          throw err;
        }
      }
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts -t "delete_edge"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
