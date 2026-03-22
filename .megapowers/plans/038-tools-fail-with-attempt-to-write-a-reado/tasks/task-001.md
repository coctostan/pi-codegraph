---
id: 1
title: ensureIndexed catches indexing errors and records failure for trust header
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/index.ts
  - test/readonly-graceful-degradation.test.ts
files_to_create: []
---

### Task 1: ensureIndexed catches indexing errors and records failure for trust header

**Files:**
- Modify: `src/index.ts`
- Test: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Write the failing test**

Replace the two "BUG REPRODUCED" tests in `test/readonly-graceful-degradation.test.ts` with a test that expects `ensureIndexed` (via `indexProject`) to NOT crash, and instead to allow subsequent reads. The existing 4 evidence tests stay unchanged.

Add to the end of the `describe` block in `test/readonly-graceful-degradation.test.ts`:

```typescript
  // ─── FIX VERIFICATION: ensureIndexed catches errors ───
  test("ensureIndexed catches readonly errors and allows subsequent reads", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Index properly first, then close
    {
      const tempStore = new SqliteGraphStore(dbPath);
      await indexProject(projectRoot, tempStore, {
        lspClientFactory: () => mockLspClient(tempStore),
      });
      tempStore.close();
    }

    // Modify a source file — forces re-indexing attempt
    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\nexport function delta() { return 99; }\n",
    );

    // Simulate extension runtime: register tools, invoke with readonly store
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let gqExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "graph_query") gqExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);

    // Make DB readonly and set up the store
    chmodSync(dbPath, 0o444);
    const ctx = { cwd: projectRoot };

    // symbol_graph should NOT throw — it should return stale data
    const sgResult = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const sgText = sgResult.content[0]?.text ?? "";
    expect(sgText).toContain("alpha");

    // graph_query should NOT throw
    const gqResult = await gqExecute!("call-2", { query: 'MATCH (n {name: "alpha"}) RETURN n' }, undefined, undefined, ctx);
    const gqText = gqResult.content[0]?.text ?? "";
    expect(gqText).toContain("alpha");

    mod.resetStoreForTesting();
    chmodSync(dbPath, 0o644);
  });
```

Also, remove the two existing "BUG REPRODUCED" tests (they document the bug; once fixed they become invalid since the behavior changes).

**Step 2 — Run test, verify it fails**
Run: `bun test test/readonly-graceful-degradation.test.ts`
Expected: FAIL — `error: attempt to write a readonly database` thrown from `ensureIndexed` → `indexProject` → `runLspIndexStage`

**Step 3 — Write minimal implementation**

In `src/index.ts`, change `ensureIndexed` from a bare passthrough to a catch-and-continue:

```typescript
let lastIndexError: Error | null = null;

export function getLastIndexErrorForTesting(): Error | null {
  return lastIndexError;
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    await indexProject(projectRoot, store);
    lastIndexError = null;
  } catch (err) {
    lastIndexError = err instanceof Error ? err : new Error(String(err));
    // Indexing failed (likely readonly DB) — degrade gracefully.
    // Tools will serve stale data from the existing graph.
  }
}
```

This is the core fix. The 4 read-oriented tools (`symbol_graph`, `impact`, `trace`, `graph_query`) now survive indexing failures and proceed to their read operations.

**Step 4 — Run test, verify it passes**
Run: `bun test test/readonly-graceful-degradation.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
