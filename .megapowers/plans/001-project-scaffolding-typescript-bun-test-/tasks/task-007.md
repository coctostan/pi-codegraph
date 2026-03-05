---
id: 7
title: Add output placeholder and rules directory
status: approved
depends_on:
  - 6
no_test: false
files_to_modify: []
files_to_create:
  - test/output-anchoring.test.ts
  - src/output/anchoring.ts
  - src/rules/.gitkeep
---

### Task 7: Add output placeholder and rules directory [depends: 6]

**Covers:** AC 12, AC 13, AC 15, AC 16

**Files:**
- Create: `test/output-anchoring.test.ts`
- Create: `src/output/anchoring.ts`
- Create: `src/rules/.gitkeep`

**Step 1 — Write the failing test**

Create `test/output-anchoring.test.ts`:

```ts
import { existsSync } from "node:fs";
import { expect, test } from "bun:test";

test("output module exports anchorResults and rules directory exists", async () => {
  const { anchorResults } = await import("../src/output/anchoring.js");

  expect(typeof anchorResults).toBe("function");
  expect(existsSync("src/rules")).toBe(true);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-anchoring.test.ts`

Expected: FAIL — `Cannot find module '../src/output/anchoring.js'`.

**Step 3 — Write minimal implementation**

Create `src/output/anchoring.ts`:

```ts
export function anchorResults(): void {}
```

Create `src/rules/.gitkeep` as an empty file.

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-anchoring.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.
