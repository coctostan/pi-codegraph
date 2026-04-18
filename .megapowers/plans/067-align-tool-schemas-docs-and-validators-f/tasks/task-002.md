---
id: 2
title: Upgrade resolve_edge.kind schema to 8-literal union and enumerate description
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - src/tools/resolve-edge.ts
  - test/closed-enum-schemas.test.ts
files_to_create: []
---

Covers AC 2, AC 3, AC 13.

**Files:**
- Modify: `src/tools/resolve-edge.ts` (add `export` to existing `VALID_EDGE_KINDS` / `isValidEdgeKind`)
- Modify: `src/index.ts` (import + switch `ResolveEdgeParams.kind` to literal union)
- Modify: `test/closed-enum-schemas.test.ts` (append regression test)

**Step 1 — Write the failing test**

Append to `test/closed-enum-schemas.test.ts` (the file created in Task 1). Add the import near the top of the file (after the existing `import { test } from "bun:test";` line), then append the new test at the bottom:

```ts
import { VALID_EDGE_KINDS } from "../src/tools/resolve-edge.js";
test("resolve_edge.kind schema is a union of VALID_EDGE_KINDS with enumerating description", async () => {
  const tools = await registered();
  const resolve = tools.find((t) => t.name === "resolve_edge");
  if (!resolve) throw new Error("resolve_edge tool not registered");
  const kind = resolve.parameters?.properties?.kind;
  if (!kind) throw new Error("resolve_edge.kind schema missing");
  const expectedDescription =
    'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".';
  if (kind.description !== expectedDescription) {
    throw new Error(`resolve_edge.kind description mismatch: ${kind.description}`);
  }
  const literals: unknown[] = Array.isArray(kind.anyOf) ? kind.anyOf.map((x: any) => x.const) : [];
  if (JSON.stringify(literals) !== JSON.stringify(VALID_EDGE_KINDS)) {
    throw new Error(`resolve_edge.kind literals do not match VALID_EDGE_KINDS: ${JSON.stringify(literals)}`);
  }
});
```

`VALID_EDGE_KINDS` is imported directly from `src/tools/resolve-edge.ts` — the canonical location per AC 2. No new module is introduced.

**Step 2 — Run test, verify it fails**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: FAIL.

Most likely failure (if Bun resolves the import first): `Export named 'VALID_EDGE_KINDS' not found in module '.../src/tools/resolve-edge.ts'` — because the current declaration at `src/tools/resolve-edge.ts:5` is `const VALID_EDGE_KINDS: EdgeKind[] = [...]` without `export`.

If Bun tolerates the import statically and the test body runs, the secondary failure is:
`resolve_edge.kind description mismatch: Edge kind (calls, imports, implements, extends, ...)` — because the current schema at `src/index.ts:44` is `Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" })` (no `anyOf` literal union yet).

Either failure is acceptable — the test fails until both the export and the schema conform.

**Step 3 — Write minimal implementation**

**(a) In `src/tools/resolve-edge.ts`**, add `export` to the existing `VALID_EDGE_KINDS` array and `isValidEdgeKind` function (≈ lines 5 and 16). The current file reads:

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

Only add the `export` keywords. Do not change the array contents or order, do not move the definitions, do not delete them. The existing internal call site at `src/tools/resolve-edge.ts:67` (`VALID_EDGE_KINDS.join(", ")` inside the `Invalid edge kind ...` error message) stays untouched — this preserves AC 7's runtime validator behavior and error-message wording.

**(b) In `src/index.ts`**, add an import near the other `./tools/...` imports (around line 11, immediately after the existing `import { resolveEdge } from "./tools/resolve-edge.js";`):

```ts
import { VALID_EDGE_KINDS as RESOLVE_EDGE_KINDS } from "./tools/resolve-edge.js";
```

The alias disambiguates from the `delete_edge.ts` copy that Task 3 will also import.

Then replace the existing `ResolveEdgeParams.kind` field. The current line (`src/index.ts:44`) reads:

```ts
  kind: Type.String({ description: "Edge kind (calls, imports, implements, extends, ...)" }),
```

Replace it with:

```ts
  kind: Type.Union(
    RESOLVE_EDGE_KINDS.map((k) => Type.Literal(k)),
    {
      description:
        'Edge kind. Allowed values: "calls", "imports", "implements", "extends", "tested_by", "co_changes_with", "renders", "routes_to".',
    },
  ),
```

Do not touch `DeleteEdgeParams.kind` at `src/index.ts:80` — Task 3 owns that change.

**Step 4 — Run test, verify it passes**

Run: `bun test test/closed-enum-schemas.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. The existing `test/tool-resolve-edge.test.ts` edge-kind validator tests (which call `resolveEdge` with invalid kinds and assert `"Invalid edge kind"` in the output) must remain green — the runtime validator still fires from `isValidEdgeKind`; the schema is defense-in-depth, not a replacement.
