---
id: 2
title: Initialize direct test hash runtime
status: approved
depends_on:
  - 1
no_test: false
files_to_modify: []
files_to_create:
  - bunfig.toml
  - test/setup-hash-init.ts
  - test/hash-init-preload.test.ts
---

Covers AC 3 and AC 4 for direct unit tests that call synchronous hashline-compatible helpers and renderers.

**Files:**
- Create: `bunfig.toml`
- Create: `test/setup-hash-init.ts`
- Create: `test/hash-init-preload.test.ts`

**Step 1 — Write the failing test**
Create `test/hash-init-preload.test.ts`:

```ts
import { expect, test } from "bun:test";
import { computeLineHash } from "../src/output/anchoring.js";

test("direct unit tests preload hash initialization before synchronous line hashing", () => {
  expect(computeLineHash(1, "export function foo() {}")).toBe("c27");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/hash-init-preload.test.ts`
Expected: FAIL — `Error: Hash not initialized — call ensureHashInit() first`

**Step 3 — Write minimal implementation**
Create `test/setup-hash-init.ts`:

```ts
import { ensureHashInit } from "../src/output/anchoring.js";

await ensureHashInit();
```

Create `bunfig.toml`:

```toml
[test]
preload = ["./test/setup-hash-init.ts"]
```

This initializes hashing once for direct Bun unit tests that call `computeLineHash`, `computeAnchor`, `symbolGraph`, `impact`, `trace`, `symbolCard`, `renderLegacyNeighborhoodBody`, or `readSourceSnippet` without repeating `await ensureHashInit()` in every test file. The Task 1 pre-init guard test still uses a cache-busted module import and continues to verify the clear pre-init failure path.

**Step 4 — Run test, verify it passes**
Run: `bun test test/hash-init-preload.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
