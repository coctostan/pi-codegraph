---
id: 6
title: Add tool placeholder exports
status: approved
depends_on:
  - 5
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-placeholders.test.ts
  - src/tools/symbol-graph.ts
  - src/tools/resolve-edge.ts
---

### Task 6: Add tool placeholder exports [depends: 5]

**Covers:** AC 10, AC 11, AC 16

**Files:**
- Create: `test/tool-placeholders.test.ts`
- Create: `src/tools/symbol-graph.ts`
- Create: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**

Create `test/tool-placeholders.test.ts`:

```ts
import { expect, test } from "bun:test";

test("tool modules export placeholder functions", async () => {
  const { symbolGraph } = await import("../src/tools/symbol-graph.js");
  const { resolveEdge } = await import("../src/tools/resolve-edge.js");

  expect(typeof symbolGraph).toBe("function");
  expect(typeof resolveEdge).toBe("function");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-placeholders.test.ts`

Expected: FAIL — `Cannot find module '../src/tools/symbol-graph.js'`.

**Step 3 — Write minimal implementation**

Create `src/tools/symbol-graph.ts`:

```ts
export function symbolGraph(): void {}
```

Create `src/tools/resolve-edge.ts`:

```ts
export function resolveEdge(): void {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-placeholders.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.
