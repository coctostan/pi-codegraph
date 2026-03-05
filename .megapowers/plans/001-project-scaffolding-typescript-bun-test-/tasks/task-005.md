---
id: 5
title: Add indexer placeholder exports
status: approved
depends_on:
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/indexer-placeholders.test.ts
  - src/indexer/pipeline.ts
  - src/indexer/tree-sitter.ts
---

### Task 5: Add indexer placeholder exports [depends: 4]

**Covers:** AC 8, AC 9, AC 16

**Files:**
- Create: `test/indexer-placeholders.test.ts`
- Create: `src/indexer/pipeline.ts`
- Create: `src/indexer/tree-sitter.ts`

**Step 1 — Write the failing test**

Create `test/indexer-placeholders.test.ts`:

```ts
import { expect, test } from "bun:test";

test("indexer modules export placeholder functions", async () => {
  const { IndexPipeline } = await import("../src/indexer/pipeline.js");
  const { treeSitterIndex } = await import("../src/indexer/tree-sitter.js");

  expect(typeof IndexPipeline).toBe("function");
  expect(typeof treeSitterIndex).toBe("function");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/indexer-placeholders.test.ts`

Expected: FAIL — `Cannot find module '../src/indexer/pipeline.js'`.

**Step 3 — Write minimal implementation**

Create `src/indexer/pipeline.ts`:

```ts
export function IndexPipeline(): void {}
```

Create `src/indexer/tree-sitter.ts`:

```ts
export function treeSitterIndex(): void {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/indexer-placeholders.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.
