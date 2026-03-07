# Revise Instructions — Iteration 4

Only **Task 2** needs changes. All other tasks are approved.

---

## Task 2: Add anchored impact output and register the impact tool

### Problem: Step 3 `src/index.ts` snippet is incomplete

Step 3 shows only the `execute` body inside the comment
`// src/index.ts (inside impact tool execute)`, but does **not** show:

1. The `import { impact } from "./tools/impact.js"` statement
2. The `ImpactParams` TypeBox schema constant
3. The full `pi.registerTool({ name: "impact", ... })` call

The test that fails without these is:
```ts
const impactTool = registeredTools.find((tool) => tool.name === "impact");
expect(impactTool).toBeDefined();           // ← FAILS: impactTool is undefined
const schema = impactTool!.parameters as any;
expect(schema.properties.symbols).toBeDefined();
expect(schema.properties.changeType).toBeDefined();
expect(schema.properties.maxDepth).toBeDefined();
```

### Fix: add the missing schema + registration to Step 3

Replace the `// src/index.ts (inside impact tool execute)` snippet with
the following complete addition to `src/index.ts`. Follow the same
TypeBox pattern already used for `SymbolGraphParams` and `ResolveEdgeParams`.

```ts
// src/index.ts — add after the existing ResolveEdgeParams constant

import { impact } from "./tools/impact.js";

const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol names" }), {
    description: "One or more symbol names that changed",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Kind of change" },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
});
```

Then, inside `piCodegraph(pi: ExtensionAPI)`, add the tool registration
after the existing `resolve_edge` registration:

```ts
  pi.registerTool({
    name: "impact",
    label: "Impact",
    description:
      "Given changed symbols, return downstream dependents classified by change type",
    parameters: ImpactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = impact({
        symbols: params.symbols,
        changeType: params.changeType,
        store,
        projectRoot,
        maxDepth: params.maxDepth,
      });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
```

### Step 2 expected failure

Keep as-is: `FAIL — Export named "impact" not found` (the `impact` named
export from `src/tools/impact.ts` doesn't exist yet when Step 2 runs).

After adding the `impact` export in `src/tools/impact.ts` (Step 3) and
the `pi.registerTool` call in `src/index.ts`, all three assertions in the
extension-registration test will pass.

---

## Task 9: Index React renders from a real TSX fixture (advisory, non-blocking)

### Weak RED state

By the time this task runs, Tasks 3, 7, and 8 are complete, so the
pipeline already supports TSX walking, the React rule, and Stage 3. If `sg`
is installed, the test written in Step 1 will pass immediately — there is
no intentional RED.

Add a note in Step 2 acknowledging this:

> **Note:** If Tasks 3, 7, and 8 are complete and `sg` is available, this
> test may already be GREEN after Step 1. Step 3 has no new implementation —
> it documents that same-file lookup from Task 7 is sufficient. Proceed to
> Step 4 directly if Step 2 is already GREEN.

### Missing sg availability guard

Task 8 integration tests guard against missing `sg` with:
```ts
const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
if ((await sgCheck.exited) !== 0) {
  console.warn("Skipping Stage 3 integration assertion: sg not available");
  return;
}
```

Task 9 integration tests lack this guard. Add the same check at the top
of both `test(...)` bodies in `test/indexer-ast-grep-react-integration.test.ts`
so that CI environments without `sg` skip gracefully rather than error.
