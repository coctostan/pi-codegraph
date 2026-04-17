---
id: 1
title: Add CODEGRAPH_DEVMODE parser helper
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/config/dev-mode.ts
  - test/dev-mode.test.ts
---

### Task 1: Add CODEGRAPH_DEVMODE parser helper

**Files:**
- Create: `src/config/dev-mode.ts`
- Test: `test/dev-mode.test.ts`

**Step 1 — Write the failing test**
Create `test/dev-mode.test.ts`:

```ts
import { test } from "bun:test";
import { devModeEnabled } from "../src/config/dev-mode.js";

test("devModeEnabled accepts the approved truthy values and rejects disabled values", () => {
  const truthy = ["1", "true", "TRUE", "yes", "YES", "on", "On"];
  for (const value of truthy) {
    if (!devModeEnabled({ CODEGRAPH_DEVMODE: value })) {
      throw new Error(`devModeEnabled rejected truthy value: ${value}`);
    }
  }

  const disabled = [undefined, "", "0", "false", "FALSE"];
  for (const value of disabled) {
    if (devModeEnabled({ CODEGRAPH_DEVMODE: value })) {
      throw new Error(`devModeEnabled accepted disabled value: ${String(value)}`);
    }
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/dev-mode.test.ts`
Expected: FAIL — `Cannot find module '../src/config/dev-mode.js' from 'test/dev-mode.test.ts'`

**Step 3 — Write minimal implementation**
Create `src/config/dev-mode.ts`:

```ts
export function devModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.CODEGRAPH_DEVMODE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/dev-mode.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
