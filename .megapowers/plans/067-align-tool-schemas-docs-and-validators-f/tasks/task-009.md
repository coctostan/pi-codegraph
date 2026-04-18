---
id: 9
title: README dead_code section references the 6 NodeKind filter values
status: approved
depends_on:
  - 8
no_test: false
files_to_modify:
  - README.md
  - test/docs-closed-enum-drift.test.ts
files_to_create: []
---

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
