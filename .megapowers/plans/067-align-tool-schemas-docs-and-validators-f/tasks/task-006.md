---
id: 6
title: README impact section mentions every changeType value
status: approved
depends_on: []
no_test: false
files_to_modify:
  - README.md
  - test/docs-closed-enum-drift.test.ts
files_to_create:
  - test/docs-closed-enum-drift.test.ts
---

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
