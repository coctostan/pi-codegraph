---
id: 1
title: Enumerate impact.changeType in parameter description
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/closed-enum-schemas.test.ts
---

Covers AC 1, AC 12.

**Files:**
- Create: `test/closed-enum-schemas.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**

Create `test/closed-enum-schemas.test.ts`:

```ts
import { test } from "bun:test";

async function registered(): Promise<Array<{ name: string; description: string; parameters?: any }>> {
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
  return registeredTools;
}

test("impact.changeType schema has the 4 literal set and an enumerating description", async () => {
  const tools = await registered();
  const impact = tools.find((t) => t.name === "impact");
  if (!impact) throw new Error("impact tool not registered");
  const ct = impact.parameters?.properties?.changeType;
  if (!ct) throw new Error("impact.changeType schema missing");

  const expectedDescription =
    'Kind of change. Allowed values: "signature_change", "removal", "behavior_change", "addition".';
  if (ct.description !== expectedDescription) {
    throw new Error(`impact.changeType description mismatch: ${ct.description}`);
  }

  const literals: unknown[] = Array.isArray(ct.anyOf) ? ct.anyOf.map((x: any) => x.const) : [];
  const expected = ["signature_change", "removal", "behavior_change", "addition"];
  if (JSON.stringify(literals) !== JSON.stringify(expected)) {
    throw new Error(`impact.changeType literals mismatch: ${JSON.stringify(literals)}`);
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: FAIL — `impact.changeType description mismatch: Kind of change` (current description is the bare string `"Kind of change"`, not the enumerating form).

**Step 3 — Write minimal implementation**

In `src/index.ts`, change the `ImpactParams` changeType description. Find the block (≈ lines 54–62):

```ts
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Kind of change" },
  ),
```

Replace the `{ description: "Kind of change" }` with:

```ts
    {
      description:
        'Kind of change. Allowed values: "signature_change", "removal", "behavior_change", "addition".',
    },
```

Leave the literal set exactly as-is (4 literals in the same order).

**Step 4 — Run test, verify it passes**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing
