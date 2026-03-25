---
id: 10
title: "dead_code: register tool in pi extension"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/tool-dead-code-wiring.test.ts
---

### Task 10: dead_code: register tool in pi extension [depends: 8]

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-dead-code-wiring.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-wiring.test.ts
import { expect, test } from "bun:test";

test("pi extension registers dead_code tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const tool = registeredTools.find((t) => t.name === "dead_code");
  expect(tool).toBeDefined();

  const schema = tool!.parameters as any;
  // All params are optional
  expect(schema.required ?? []).toEqual([]);
  // Has name, file, kind, glob params
  expect(schema.properties.name).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.properties.kind).toBeDefined();
  expect(schema.properties.glob).toBeDefined();

  // Should have ptc with read-only policy
  expect((tool as any).ptc?.readOnly).toBe(true);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined() — Expected undefined to be defined`

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```typescript
import { deadCode } from "./tools/dead-code.js";
```

2. Add params schema after existing schemas:
```typescript
const DeadCodeParams = Type.Object({
  name: Type.Optional(Type.String({ description: "Symbol name to check (omit for sweep mode)" })),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  kind: Type.Optional(Type.String({ description: "Filter by node kind (function, class, interface, etc.)" })),
  glob: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
});
```

3. Register the tool inside `piCodegraph()`:
```typescript
  registerReadOnlyTool(pi, {
    name: "dead_code",
    label: "Dead Code",
    description: "Find unreferenced symbols. With name: check if a symbol has references. Without name: find all exported symbols with zero inbound edges.",
    parameters: DeadCodeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = deadCode({ name: params.name, file: params.file, kind: params.kind, glob: params.glob, store, projectRoot });
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
