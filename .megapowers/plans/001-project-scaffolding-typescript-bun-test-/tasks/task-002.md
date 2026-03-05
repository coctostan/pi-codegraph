---
id: 2
title: Add extension entrypoint and smoke import test
status: approved
depends_on:
  - 1
no_test: false
files_to_modify: []
files_to_create:
  - src/index.ts
  - test/smoke.test.ts
---

### Task 2: Add extension entrypoint and smoke import test [depends: 1]

**Covers:** AC 4, AC 14, AC 16

**Files:**
- Create: `test/smoke.test.ts`
- Create: `src/index.ts`

**Step 1 — Write the failing test**

Create `test/smoke.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

describe("scaffold smoke", () => {
  test("src/index.ts loads and exports default function", async () => {
    const mod = await import("../src/index.js");
    expect(typeof mod.default).toBe("function");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/smoke.test.ts`

Expected: FAIL — `Cannot find module '../src/index.js'`.

**Step 3 — Write minimal implementation**

Create `src/index.ts`:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function piCodegraph(_pi: ExtensionAPI): void {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/smoke.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
