---
id: 1
title: Surface actual SQLite error in graphQuery catch block
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/graph-query.ts
files_to_create: []
---

### Task 1: Surface actual SQLite error in graphQuery catch block

**Files:**
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-execution-error-detail.test.ts` (already exists from reproduce phase)

**Step 1 — Verify the failing test exists**

The test was written during reproduction. Full code at `test/tool-graph-query-execution-error-detail.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery surfaces actual SQLite error in execution_error message", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-err-detail-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    // Query a non-existent column — compiles to valid SQL that fails at SQLite level
    const output = graphQuery({
      query: 'MATCH (n) WHERE n.nonexistent_column = "test" RETURN n',
      store,
      projectRoot,
    });

    // Should contain an execution_error
    expect(output).toContain("execution_error:");

    // BUG: currently says "failed to execute compiled query" with no detail.
    // Should surface the actual SQLite error message instead.
    expect(output).toContain("no such column");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-graph-query-execution-error-detail.test.ts`

Expected: FAIL — `error: expect(received).toContain(expected)` — Expected to contain: `"no such column"`, Received: `"...execution_error: failed to execute compiled query\n"`

**Step 3 — Write minimal implementation**

In `src/tools/graph-query.ts`, change lines 31-32 from:

```typescript
    } catch {
      return prependTrustHeader("execution_error: failed to execute compiled query\n", { stats });
    }
```

to:

```typescript
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return prependTrustHeader(`execution_error: ${msg}\n`, { stats });
    }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-graph-query-execution-error-detail.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing
