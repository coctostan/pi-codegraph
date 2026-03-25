---
id: 15
title: "token-tracker: session reset on resetStoreForTesting"
status: approved
depends_on:
  - 13
no_test: false
files_to_modify: []
files_to_create:
  - test/token-tracker-session-reset.test.ts
---

### Task 15: token-tracker: session reset on resetStoreForTesting [depends: 13]

**Files:**
- Create: `test/token-tracker-session-reset.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-session-reset.test.ts
import { expect, test } from "bun:test";
import { trackCall, getSessionStats } from "../src/tools/token-tracker.js";
import { resetStoreForTesting } from "../src/index.js";

test("resetStoreForTesting also resets token tracker session", () => {
  // Accumulate some stats
  trackCall("symbol_graph", 100, 20);
  trackCall("trace", 200, 30);

  const before = getSessionStats();
  expect(before.totalCalls).toBe(2);

  // Reset via the existing test hook
  resetStoreForTesting();

  const after = getSessionStats();
  expect(after.totalCalls).toBe(0);
  expect(after.totalTokensSaved).toBe(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-session-reset.test.ts`
Expected: PASS — the `resetSession()` call was already added to `resetStoreForTesting` in Task 13. This test confirms that wiring.

**Step 3 — No additional implementation needed**

The `resetSession()` call in `resetStoreForTesting()` was already added in Task 13.

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-session-reset.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
