---
id: 7
title: README resolve_edge section lists all 8 edge kinds and uses only valid kinds
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - README.md
  - test/docs-closed-enum-drift.test.ts
files_to_create: []
---

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
