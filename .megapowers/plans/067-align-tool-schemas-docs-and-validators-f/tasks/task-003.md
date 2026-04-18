---
id: 3
title: Upgrade delete_edge.kind schema to 8-literal union and enumerate description
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
  - src/tools/delete-edge.ts
  - test/closed-enum-schemas.test.ts
files_to_create: []
---

Covers AC 4, AC 5, AC 14.

**Files:**
- Modify: `src/tools/delete-edge.ts` (add `export` to existing `VALID_EDGE_KINDS` / `isValidEdgeKind`)
- Modify: `src/index.ts` (import + switch `DeleteEdgeParams.kind` to literal union)
- Modify: `test/closed-enum-schemas.test.ts` (append regression test)

**Step 1 — Write the failing test**

Append to `test/closed-enum-schemas.test.ts`:

```ts
test("delete_edge.kind schema is a union of VALID_EDGE_KINDS with enumerating description", async () => {
  const tools = await registered();
  const del = tools.find((t) => t.name === "delete_edge");
  if (!del) throw new Error("delete_edge tool not registered");
  const kind = del.parameters?.properties?.kind;
  if (!kind) throw new Error("delete_edge.kind schema missing");
  const expectedDescription =
    'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".';
  if (kind.description !== expectedDescription) {
    throw new Error(`delete_edge.kind description mismatch: ${kind.description}`);
  }
  const literals: unknown[] = Array.isArray(kind.anyOf) ? kind.anyOf.map((x: any) => x.const) : [];
  if (JSON.stringify(literals) !== JSON.stringify(VALID_EDGE_KINDS)) {
    throw new Error(`delete_edge.kind literals do not match VALID_EDGE_KINDS: ${JSON.stringify(literals)}`);
  }
});
```

The `VALID_EDGE_KINDS` symbol is already imported at the top of this file from `../src/tools/resolve-edge.js` by Task 2. Both tool files declare the identical 8-literal array, so asserting literal equality against the resolve-edge copy is equivalent to asserting it against the delete-edge copy. (AC 4 requires the `DeleteEdgeParams.kind` schema to match the set `VALID_EDGE_KINDS` in `src/tools/delete-edge.ts` — the assertion holds because the two constants are value-equal.)

**Step 2 — Run test, verify it fails**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: FAIL — `delete_edge.kind description mismatch: Edge kind (calls, imports, implements, extends, ...)`.

The current `DeleteEdgeParams.kind` schema at `src/index.ts:80` is `Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" })`, so the description assertion is what fires first.

**Step 3 — Write minimal implementation**

**(a) In `src/tools/delete-edge.ts`**, add `export` to the existing `VALID_EDGE_KINDS` array and `isValidEdgeKind` function (≈ lines 5 and 16). The current file reads:

```ts
const VALID_EDGE_KINDS: EdgeKind[] = [
  "calls",
  "imports",
  "implements",
  "extends",
  "tested_by",
  "co_changes_with",
  "renders",
  "routes_to",
];

function isValidEdgeKind(kind: string): kind is EdgeKind {
  return VALID_EDGE_KINDS.includes(kind as EdgeKind);
}
```

Change it to:

```ts
export const VALID_EDGE_KINDS: EdgeKind[] = [
  "calls",
  "imports",
  "implements",
  "extends",
  "tested_by",
  "co_changes_with",
  "renders",
  "routes_to",
];

export function isValidEdgeKind(kind: string): kind is EdgeKind {
  return VALID_EDGE_KINDS.includes(kind as EdgeKind);
}
```

Only add the `export` keywords. Do not change contents or order, do not relocate the definitions, do not delete them. The existing internal call site at `src/tools/delete-edge.ts:62` (`VALID_EDGE_KINDS.join(", ")` inside the `Invalid edge kind ...` error message) stays untouched — this preserves AC 7's runtime validator in `delete-edge.ts`.

**(b) In `src/index.ts`**, add a second aliased import just below the Task 2 import (near line 12, after `import { deleteEdge } from "./tools/delete-edge.js";`):

```ts
import { VALID_EDGE_KINDS as DELETE_EDGE_KINDS } from "./tools/delete-edge.js";
```

Then replace the existing `DeleteEdgeParams.kind` field. The current line (`src/index.ts:80`) reads:

```ts
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
```

Replace it with:

```ts
  kind: Type.Union(
    DELETE_EDGE_KINDS.map((k) => Type.Literal(k)),
    {
      description:
        'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".',
    },
  ),
```

Leave `ResolveEdgeParams.kind` (modified by Task 2) unchanged.

**Step 4 — Run test, verify it passes**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. The existing `test/tool-delete-edge.test.ts` tests (which assert `"Invalid edge kind"` appears when `deleteEdge` is called with an unknown kind) must remain green — the runtime validator in `delete-edge.ts` still fires.
