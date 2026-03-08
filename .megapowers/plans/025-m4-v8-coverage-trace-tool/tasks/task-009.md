---
id: 9
title: Wire the trace tool into the extension
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-wiring.test.ts
files_to_create: []
---

### Task 9: Wire the trace tool into the extension [depends: 8]
- Modify: `src/index.ts`
- Modify: `test/extension-wiring.test.ts`
**ACs covered:** 19 (wiring only; behavior ACs covered in prior tasks)

**Step 1 — Write the failing test**
`test/extension-wiring.test.ts` (append this test)
```ts
import { expect, test } from "bun:test";

test("pi extension registers trace tool with correct schema", async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((t) => t.name === "trace");
  expect(traceTool).toBeDefined();

  const schema = traceTool!.parameters as any;
  expect(schema.properties.entry).toBeDefined();
  expect(schema.properties.file).toBeDefined();
  expect(schema.required).toContain("entry");
  expect(schema.required).not.toContain("file");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-wiring.test.ts`
Expected: FAIL — `expect(received).toBeDefined()` for missing trace registration

**Step 3 — Write minimal implementation**
`src/index.ts` — make targeted edits to the current file:

Add the import near existing tool imports:
```ts
import { trace } from "./tools/trace.js";
```

Add the schema near the existing param schemas:
```ts
const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

Append a registration alongside the existing tool registrations, preserving the current execute return shape:
```ts
pi.registerTool({
  name: "trace",
  label: "Trace",
  description: "Return one deterministic anchored execution path for a test, symbol, or endpoint",
  parameters: TraceParams,
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const projectRoot = ctx.cwd;
    const store = getOrCreateStore(projectRoot);
    await ensureIndexed(projectRoot, store);
    const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
    return { content: [{ type: "text", text }], details: undefined };
  },
});
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-wiring.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
