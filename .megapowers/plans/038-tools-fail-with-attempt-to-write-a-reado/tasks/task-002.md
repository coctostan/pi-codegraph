---
id: 2
title: symbol_graph lazy resolver handles write failures without crashing
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/readonly-graceful-degradation.test.ts
files_to_create: []
---

### Task 2: symbol_graph lazy resolver handles write failures without crashing [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Test: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Write the failing test**

Add to the `describe` block in `test/readonly-graceful-degradation.test.ts`:

```typescript
  test("symbol_graph lazy resolver (resolveMissingCallers) does not crash on readonly DB", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Fully index first so there are nodes to resolve
    {
      const tempStore = new SqliteGraphStore(dbPath);
      await indexProject(projectRoot, tempStore, {
        lspClientFactory: () => mockLspClient(tempStore),
      });
      tempStore.close();
    }

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);

    // Make readonly — ensureIndexed won't crash (Task 1), but
    // resolveMissingCallers/resolveImplementations will try addNode/addEdge
    chmodSync(dbPath, 0o444);
    const ctx = { cwd: projectRoot };

    // Should NOT throw — resolver writes should be caught
    const result = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("alpha");
    expect(text).toContain("function");

    mod.resetStoreForTesting();
    chmodSync(dbPath, 0o644);
  });
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/readonly-graceful-degradation.test.ts -t "lazy resolver"`
Expected: FAIL — `error: attempt to write a readonly database` thrown from `resolveMissingCallers` → `store.addEdge()` or `setMarker` → `store.addNode()`

**Step 3 — Write minimal implementation**

In `src/index.ts`, wrap the `resolveMissingCallers`/`resolveImplementations` calls in the `symbol_graph` tool's execute in a try/catch:

Change lines 113-120 from:
```typescript
        const client = new TsServerClient(projectRoot);
        try {
          await resolveMissingCallers(resolvedNode, store, projectRoot, client);
          if (resolvedNode.kind === "interface") {
            await resolveImplementations(resolvedNode, store, projectRoot, client);
          }
        } finally {
          await client.shutdown().catch(() => {});
        }
```

To:
```typescript
        const client = new TsServerClient(projectRoot);
        try {
          await resolveMissingCallers(resolvedNode, store, projectRoot, client);
          if (resolvedNode.kind === "interface") {
            await resolveImplementations(resolvedNode, store, projectRoot, client);
          }
        } catch {
          // Resolver writes failed (likely readonly DB) — continue with existing graph data
        } finally {
          await client.shutdown().catch(() => {});
        }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/readonly-graceful-degradation.test.ts -t "lazy resolver"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
