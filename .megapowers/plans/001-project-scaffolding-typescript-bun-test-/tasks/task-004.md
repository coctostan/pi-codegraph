---
id: 4
title: Add GraphStore and SqliteGraphStore placeholders
status: approved
depends_on:
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - test/graph-store.test.ts
  - src/graph/store.ts
  - src/graph/sqlite.ts
---

### Task 4: Add GraphStore and SqliteGraphStore placeholders [depends: 3]

**Covers:** AC 6, AC 7, AC 16

**Files:**
- Create: `test/graph-store.test.ts`
- Create: `src/graph/store.ts`
- Create: `src/graph/sqlite.ts`

**Step 1 — Write the failing test**

Create `test/graph-store.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { GraphStore } from "../src/graph/store.js";

test("graph store modules load", async () => {
  const storeModule = await import("../src/graph/store.js");
  expect(storeModule).toBeDefined();

  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const store: GraphStore = new SqliteGraphStore();
  expect(store).toBeInstanceOf(SqliteGraphStore);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/graph-store.test.ts`

Expected: FAIL — `Cannot find module '../src/graph/store.js'`.

**Step 3 — Write minimal implementation**

Create `src/graph/store.ts`:

```ts
export interface GraphStore {}
```

Create `src/graph/sqlite.ts`:

```ts
import type { GraphStore } from "./store.js";

export class SqliteGraphStore implements GraphStore {}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/graph-store.test.ts`

Expected: PASS.

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing.
