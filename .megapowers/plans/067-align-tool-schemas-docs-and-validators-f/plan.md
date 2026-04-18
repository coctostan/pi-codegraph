# Plan

### Task 1: Enumerate impact.changeType in parameter description

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

### Task 2: Upgrade resolve_edge.kind schema to 8-literal union and enumerate description [depends: 1]

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

### Task 3: Upgrade delete_edge.kind schema to 8-literal union and enumerate description [depends: 2]

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

### Task 4: Enumerate dead_code.kind in parameter description [depends: 1]

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

### Task 5: Lock down: no open-ended suffixes in audited parameter descriptions [depends: 1, 2, 3, 4]

Covers AC 17.

**Files:**
- Create: `test/closed-enum-no-open-suffix.test.ts`

**Step 1 — Write the failing test**

Create `test/closed-enum-no-open-suffix.test.ts`:

```ts
import { test } from "bun:test";

async function registered(): Promise<Array<{ name: string; description: string; parameters?: any }>> {
  const tools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      tools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
  (mod as any).default(mockPi as any);
  return tools;
}

function check(desc: string, label: string) {
  if (desc.includes("...")) {
    throw new Error(`${label} description contains "...": ${desc}`);
  }
  // Match "etc." as a token (avoid false positives on future "etcetera", etc.)
  if (/\betc\.\B|\betc\./.test(desc) || desc.includes(" etc.") || desc.endsWith("etc.")) {
    throw new Error(`${label} description contains "etc.": ${desc}`);
  }
}

test("audited closed-value parameter descriptions contain no open-ended suffixes", async () => {
  const prev = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    const tools = await registered();

    const impact = tools.find((t) => t.name === "impact");
    const resolveEdge = tools.find((t) => t.name === "resolve_edge");
    const deleteEdge = tools.find((t) => t.name === "delete_edge");
    const deadCode = tools.find((t) => t.name === "dead_code");
    if (!impact || !resolveEdge || !deleteEdge || !deadCode) {
      throw new Error("one or more audited tools not registered");
    }

    check(impact.parameters.properties.changeType.description, "impact.changeType");
    check(resolveEdge.parameters.properties.kind.description, "resolve_edge.kind");
    check(deleteEdge.parameters.properties.kind.description, "delete_edge.kind");
    check(deadCode.parameters.properties.kind.description, "dead_code.kind");
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
});
```

**Step 2 — Run test, verify it fails (sanity check ordering)**

Run: `bun test test/closed-enum-no-open-suffix.test.ts`

Expected: PASS after Tasks 1–4 (those removed `"..."` and `etc.` already). If run in isolation before Tasks 1–4, it would fail with e.g. `impact.changeType description contains "..."`. Since this task depends on 1–4, add the file here as a lock-in — the runner will print `1 pass` immediately.

If the test fails, revisit Tasks 1–4 to ensure the new descriptions are the exact strings specified (no stray `"..."` or `etc.`).

**Step 3 — Write minimal implementation**

No production code change is required — Tasks 1–4 already removed the suffixes. This task is a lock-in regression test only.

**Step 4 — Run test, verify it passes**

Run: `bun test test/closed-enum-no-open-suffix.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 6: README impact section mentions every changeType value

Covers AC 8, part of AC 16.

**Files:**
- Create: `test/docs-closed-enum-drift.test.ts`
- Modify: `README.md`

**Step 1 — Write the failing test**

Create `test/docs-closed-enum-drift.test.ts`:

```ts
import { test } from "bun:test";
import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");

// Extract a tool's section body: from "#### `<tool>`" up to the next "####" or "###".
function section(tool: string): string {
  const header = "#### `" + tool + "`";
  const startIdx = readme.indexOf(header);
  if (startIdx < 0) throw new Error(`README section not found for ${tool}`);
  const rest = readme.slice(startIdx + header.length);
  const nextIdx = rest.search(/\n####\s|\n###\s/);
  return nextIdx < 0 ? rest : rest.slice(0, nextIdx);
}

test("README impact section mentions every changeType value", () => {
  const body = section("impact");
  for (const v of ["signature_change", "removal", "behavior_change", "addition"]) {
    if (!body.includes(v)) {
      throw new Error(`README impact section missing changeType value "${v}"`);
    }
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: FAIL — `README impact section missing changeType value "removal"` (current README only mentions `signature_change` in the `impact` example).

**Step 3 — Write minimal implementation**

In `README.md`, find the `#### \`impact\`` section (≈ lines 95–99):

```
#### `impact`
Return the classified blast radius for a set of changed symbols.
```
impact({ symbols: ["validateToken"], changeType: "signature_change" })
```
```

Replace that section body with:

```
#### `impact`
Return the classified blast radius for a set of changed symbols.
Allowed `changeType` values: `"signature_change"`, `"removal"`, `"behavior_change"`, `"addition"`.
```
impact({ symbols: ["validateToken"], changeType: "signature_change" })
impact({ symbols: ["validateToken"], changeType: "removal" })
impact({ symbols: ["validateToken"], changeType: "behavior_change" })
impact({ symbols: ["validateToken"], changeType: "addition" })
```
```

(Preserve the surrounding fences exactly; only the body changes.)

**Step 4 — Run test, verify it passes**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. In particular, `test/docs-symbol-graph-unified-surface.test.ts` must stay green — this change only touches the `impact` section, not `symbol_graph`.

### Task 7: README resolve_edge section lists all 8 edge kinds and uses only valid kinds [depends: 6]

Covers AC 9, part of AC 16.

**Files:**
- Modify: `README.md`
- Modify: `test/docs-closed-enum-drift.test.ts`

**Step 1 — Write the failing test**

Append to `test/docs-closed-enum-drift.test.ts`:

```ts
const EDGE_KINDS = [
  "calls",
  "imports",
  "implements",
  "extends",
  "tested_by",
  "co_changes_with",
  "renders",
  "routes_to",
] as const;

test("README resolve_edge section lists all 8 edge kinds", () => {
  const body = section("resolve_edge");
  for (const k of EDGE_KINDS) {
    if (!body.includes(k)) {
      throw new Error(`README resolve_edge section missing edge kind "${k}"`);
    }
  }
});

test("README resolve_edge section examples use only valid edge kinds", () => {
  const body = section("resolve_edge");
  // Find every `kind: "..."` occurrence in the section body.
  const re = /kind:\s*"([^"]+)"/g;
  const kinds = [...body.matchAll(re)].map((m) => m[1]);
  for (const k of kinds) {
    if (!(EDGE_KINDS as readonly string[]).includes(k!)) {
      throw new Error(`README resolve_edge example uses invalid kind "${k}"`);
    }
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: FAIL — `README resolve_edge section missing edge kind "imports"` (current section only uses `kind: "calls"` in the example).

**Step 3 — Write minimal implementation**

In `README.md`, find the `#### \`resolve_edge\`` section (≈ lines 80–89):

```
#### `resolve_edge`
Create an evidence-backed edge in the symbol graph.
```
resolve_edge({
  source: "AuthController",
  target: "TokenService",
  kind: "calls",
  evidence: "Injected via NestJS @Inject decorator in constructor"
})
```
```

Replace it with:

```
#### `resolve_edge`
Create an evidence-backed edge in the symbol graph.
Allowed `kind` values: `"calls"`, `"imports"`, `"implements"`, `"extends"`, `"tested_by"`, `"co_changes_with"`, `"renders"`, `"routes_to"`.
```
resolve_edge({
  source: "AuthController",
  target: "TokenService",
  kind: "calls",
  evidence: "Injected via NestJS @Inject decorator in constructor"
})
```
```

The `Allowed kind values:` sentence supplies every edge-kind token to satisfy the coverage test without adding extra code examples. The single example keeps `kind: "calls"`, which is in the valid set.

**Step 4 — Run test, verify it passes**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 8: README delete_edge section lists all 8 edge kinds and uses only valid kinds [depends: 7]

Covers AC 10, part of AC 16.

**Files:**
- Modify: `README.md`
- Modify: `test/docs-closed-enum-drift.test.ts`

**Step 1 — Write the failing test**

Append to `test/docs-closed-enum-drift.test.ts`:

```ts
test("README delete_edge section lists all 8 edge kinds", () => {
  const body = section("delete_edge");
  for (const k of EDGE_KINDS) {
    if (!body.includes(k)) {
      throw new Error(`README delete_edge section missing edge kind "${k}"`);
    }
  }
});

test("README delete_edge section examples use only valid edge kinds", () => {
  const body = section("delete_edge");
  const re = /kind:\s*"([^"]+)"/g;
  const kinds = [...body.matchAll(re)].map((m) => m[1]);
  for (const k of kinds) {
    if (!(EDGE_KINDS as readonly string[]).includes(k!)) {
      throw new Error(`README delete_edge example uses invalid kind "${k}"`);
    }
  }
});
```

(`EDGE_KINDS` and `section` are already declared at the top of the file from Tasks 6–7.)

**Step 2 — Run test, verify it fails**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: FAIL — `README delete_edge section missing edge kind "imports"` (current section only uses `kind: "calls"`).

**Step 3 — Write minimal implementation**

In `README.md`, find the `#### \`delete_edge\`` section (≈ lines 90–94):

```
#### `delete_edge`
Delete an agent-created edge from the symbol graph.
```
delete_edge({ source: "AuthController", target: "TokenService", kind: "calls" })
```
```

Replace it with:

```
#### `delete_edge`
Delete an agent-created edge from the symbol graph.
Allowed `kind` values: `"calls"`, `"imports"`, `"implements"`, `"extends"`, `"tested_by"`, `"co_changes_with"`, `"renders"`, `"routes_to"`.
```
delete_edge({ source: "AuthController", target: "TokenService", kind: "calls" })
```
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 9: README dead_code section references the 6 NodeKind filter values [depends: 8]

Covers AC 11, part of AC 16.

**Files:**
- Modify: `README.md`
- Modify: `test/docs-closed-enum-drift.test.ts`

**Step 1 — Write the failing test**

Append to `test/docs-closed-enum-drift.test.ts`:

```ts
const NODE_KINDS = ["function", "class", "interface", "module", "endpoint", "test"] as const;

test("README dead_code section references every NodeKind filter value", () => {
  const body = section("dead_code");
  for (const k of NODE_KINDS) {
    // These are very common English words; require them to appear inside a backtick-quoted
    // literal or a JS string literal ("..." or '...') so we don't match prose.
    const quoted = new RegExp("[\\\"`']" + k + "[\\\"`']");
    if (!quoted.test(body)) {
      throw new Error(`README dead_code section missing quoted NodeKind "${k}"`);
    }
  }
});

test("README dead_code section examples use only valid NodeKind filter values", () => {
  const body = section("dead_code");
  // Find every `kind: "..."` occurrence.
  const re = /kind:\s*"([^"]+)"/g;
  const kinds = [...body.matchAll(re)].map((m) => m[1]);
  for (const k of kinds) {
    if (!(NODE_KINDS as readonly string[]).includes(k!)) {
      throw new Error(`README dead_code example uses invalid kind "${k}"`);
    }
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: FAIL — `README dead_code section missing quoted NodeKind "function"` (current section body is only ` dead_code({}) `).

**Step 3 — Write minimal implementation**

In `README.md`, find the `#### \`dead_code\`` section (≈ lines 122–126):

```
#### `dead_code`
Find unreferenced exported symbols or check whether a symbol is still referenced.
```
dead_code({})
```
```

Replace it with:

```
#### `dead_code`
Find unreferenced exported symbols or check whether a symbol is still referenced.
Optional `kind` filter accepts a node kind. Allowed values: `"function"`, `"class"`, `"interface"`, `"module"`, `"endpoint"`, `"test"`.
```
dead_code({})
dead_code({ kind: "function" })
```
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/docs-closed-enum-drift.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 10: Lock symbol_graph.include wording/schema (regression guard for #066) [depends: 1, 2, 3, 4]

Covers AC 18.

**Files:**
- Create: `test/symbol-graph-include-lock.test.ts`

**Step 1 — Write the failing test**

Create `test/symbol-graph-include-lock.test.ts`:

```ts
import { test } from "bun:test";

test("symbol_graph.include wording and literal set from #066 are unchanged", async () => {
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

  const sg = registeredTools.find((t) => t.name === "symbol_graph");
  if (!sg) throw new Error("symbol_graph not registered");

  const include = sg.parameters?.properties?.include;
  if (!include) throw new Error("symbol_graph.include schema missing");

  const expectedDescription =
    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';
  if (include.description !== expectedDescription) {
    throw new Error(`symbol_graph.include description drifted: ${include.description}`);
  }

  const items = include.items;
  const literals: unknown[] = Array.isArray(items?.anyOf) ? items.anyOf.map((x: any) => x.const) : [];
  const expectedLiterals = ["neighborhood", "contract", "source"];
  if (JSON.stringify(literals) !== JSON.stringify(expectedLiterals)) {
    throw new Error(`symbol_graph.include item literals drifted: ${JSON.stringify(literals)}`);
  }
});
```

**Step 2 — Run test, verify it fails (or passes as a lock-in)**

Run: `bun test test/symbol-graph-include-lock.test.ts`

Expected: PASS — this is a lock-in for #066 wording already in place. If any prior task accidentally touched `SymbolGraphParams.include`, the runner will print `symbol_graph.include description drifted: ...` or `symbol_graph.include item literals drifted: [...]`. Fix by reverting that area of `src/index.ts`.

**Step 3 — Write minimal implementation**

No production code change expected. If the lock-in fires, restore `SymbolGraphParams.include` in `src/index.ts` to:

```ts
  include: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("neighborhood"),
        Type.Literal("contract"),
        Type.Literal("source"),
      ]),
      {
        description:
          'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.',
      },
    ),
  ),
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/symbol-graph-include-lock.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.

### Task 11: Lock top-level tool descriptions free of inline examples and enumerations [depends: 1, 2, 3, 4]

Covers AC 21 (style-guide compliance from `docs/tool-descriptions.md`) and provides ancillary coverage for AC 19 and AC 20 (registration surface gating by `CODEGRAPH_DEVMODE`).

**Files:**
- Create: `test/tool-descriptions-style-guard.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-descriptions-style-guard.test.ts`:

```ts
import { test } from "bun:test";

async function registeredWith(devMode: boolean) {
  const prev = process.env.CODEGRAPH_DEVMODE;
  if (devMode) process.env.CODEGRAPH_DEVMODE = "1";
  else delete process.env.CODEGRAPH_DEVMODE;
  try {
    const tools: Array<{ name: string; description: string }> = [];
    const mockPi = {
      registerTool(tool: { name: string; description: string }) {
        tools.push({ name: tool.name, description: tool.description });
      },
      on() {},
    };
    const mod = await import("../src/index.js");
    if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
    (mod as any).default(mockPi as any);
    return tools;
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
}

test("registration surface gated on CODEGRAPH_DEVMODE", async () => {
  const def = (await registeredWith(false)).map((t) => t.name).sort();
  const expectedDefault = ["delete_edge", "impact", "resolve_edge", "symbol_graph", "trace"];
  if (JSON.stringify(def) !== JSON.stringify(expectedDefault)) {
    throw new Error(`default surface drifted: ${JSON.stringify(def)}`);
  }

  const dev = (await registeredWith(true)).map((t) => t.name).sort();
  const expectedDev = [
    "dead_code",
    "delete_edge",
    "graph_overview",
    "graph_query",
    "impact",
    "resolve_edge",
    "symbol_graph",
    "trace",
  ];
  if (JSON.stringify(dev) !== JSON.stringify(expectedDev)) {
    throw new Error(`dev surface drifted: ${JSON.stringify(dev)}`);
  }
});

test("audited tool top-level descriptions contain no inline examples or enumerations", async () => {
  const tools = await registeredWith(true);
  const audited = new Set(["impact", "resolve_edge", "delete_edge", "dead_code"]);
  for (const t of tools) {
    if (!audited.has(t.name)) continue;
    const d = t.description;
    // No enumerated-literal phrasing in the top-level description (those belong in parameter description).
    if (/Allowed values:/.test(d)) {
      throw new Error(`${t.name} top-level description contains "Allowed values:" — move to parameter description: ${d}`);
    }
    // No inline code-example markers.
    if (d.includes("```") || /\bexample:/i.test(d)) {
      throw new Error(`${t.name} top-level description contains an inline example: ${d}`);
    }
  }
});
```

**Step 2 — Run test, verify it fails (or passes as a lock-in)**

Run: `bun test test/tool-descriptions-style-guard.test.ts`

Expected: PASS — Tasks 1–4 only modify parameter descriptions, never the top-level tool descriptions, so both assertions already hold. If the runner reports e.g. `impact top-level description contains "Allowed values:"`, it means a prior task accidentally leaked the enumeration into the top-level description — fix by moving the `Allowed values:` text back into the parameter schema's description field only.

**Step 3 — Write minimal implementation**

No production code change expected. This task exists as a lock-in so future edits don't silently violate `docs/tool-descriptions.md`.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-descriptions-style-guard.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing, type-check clean.
