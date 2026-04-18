---
id: 8
title: README delete_edge section lists all 8 edge kinds and uses only valid kinds
status: approved
depends_on:
  - 7
no_test: false
files_to_modify:
  - README.md
  - test/docs-closed-enum-drift.test.ts
files_to_create: []
---

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
