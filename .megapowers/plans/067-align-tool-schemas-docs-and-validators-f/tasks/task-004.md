---
id: 4
title: Enumerate dead_code.kind in parameter description
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/closed-enum-schemas.test.ts
files_to_create: []
---

Covers AC 6, AC 15.

**Files:**
- Modify: `src/index.ts`
- Modify: `test/closed-enum-schemas.test.ts`

**Step 1 — Write the failing test**

Append to `test/closed-enum-schemas.test.ts`:

```ts
test("dead_code.kind description enumerates the 6 NodeKind values (dev mode)", async () => {
  const prev = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    const tools = await registered();
    const dc = tools.find((t) => t.name === "dead_code");
    if (!dc) throw new Error("dead_code tool not registered (should register under CODEGRAPH_DEVMODE=1)");
    const kind = dc.parameters?.properties?.kind;
    if (!kind) throw new Error("dead_code.kind schema missing");

    const expectedDescription =
      'Filter by node kind. Allowed values: "function", "class", "interface", "module", "endpoint", "test".';
    if (kind.description !== expectedDescription) {
      throw new Error(`dead_code.kind description mismatch: ${kind.description}`);
    }
    // Schema shape stays optional string (spec C4) — verify it's still a plain string type, not a union.
    if (Array.isArray(kind.anyOf)) {
      throw new Error("dead_code.kind schema should remain Type.Optional(Type.String), not a union");
    }
    if (kind.type !== "string") {
      throw new Error(`dead_code.kind should be a string type, got: ${JSON.stringify(kind)}`);
    }
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: FAIL — `dead_code.kind description mismatch: Filter by node kind (function, class, interface, etc.)` (current wording uses `etc.`).

**Step 3 — Write minimal implementation**

In `src/index.ts`, find the `DeadCodeParams` block (≈ lines 88–93). Change only the `kind` field's description:

```ts
  kind: Type.Optional(Type.String({ description: "Filter by node kind (function, class, interface, etc.)" })),
```

to:

```ts
  kind: Type.Optional(
    Type.String({
      description:
        'Filter by node kind. Allowed values: "function", "class", "interface", "module", "endpoint", "test".',
    }),
  ),
```

Leave `name`, `file`, and `glob` fields unchanged.

**Step 4 — Run test, verify it passes**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
