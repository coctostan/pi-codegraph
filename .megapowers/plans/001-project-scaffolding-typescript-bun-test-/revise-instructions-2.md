## Task 4: Add GraphStore and SqliteGraphStore placeholders

One blocking issue remains: Step 2 failure expectation is incorrect for the current Step 1 code.

### What is wrong
- Current Step 1 uses:
  - `import type { GraphStore } from "../src/graph/store.js";`
  - `import { SqliteGraphStore } from "../src/graph/sqlite.js";`
- In `bun test`, `import type` is erased at runtime, so the first runtime failure is from missing `../src/graph/sqlite.js`, not `../src/graph/store.js`.
- Current Step 2 says expected failure is store module missing. That is not deterministic/executable.

### Required fix
Update Task 4 so Step 2 expected failure matches actual execution.

#### Option A (minimal change)
Keep Step 1 as-is and change Step 2 to:
- Run: `bun test test/graph-store.test.ts`
- Expected: `FAIL — Cannot find module '../src/graph/sqlite.js'`

#### Option B (preferred deterministic AC6+AC7 flow)
Change Step 1 test to use dynamic imports in order, so missing `store.ts` fails first and deterministically:

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

Then set Step 2 expected failure to:
- `FAIL — Cannot find module '../src/graph/store.js'`

Either option is acceptable, but Step 2 must exactly match what the runner will print for the provided Step 1 code.