---
id: 3
title: resolve_edge returns clear error message when DB is readonly
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/readonly-graceful-degradation.test.ts
files_to_create: []
---

### Task 3: resolve_edge returns clear error message when DB is readonly [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Test: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Write the failing test**

Add to the `describe` block in `test/readonly-graceful-degradation.test.ts`:

```typescript
  test("resolve_edge returns clear error message on readonly DB instead of crashing", async () => {
    const projectRoot = createTestProject();
    const dbPath = populateStore(projectRoot);

    // Index first
    {
      const tempStore = new SqliteGraphStore(dbPath);
      await indexProject(projectRoot, tempStore, {
        lspClientFactory: () => mockLspClient(tempStore),
      });
      tempStore.close();
    }

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let reExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "resolve_edge") reExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);

    chmodSync(dbPath, 0o444);
    const ctx = { cwd: projectRoot };

    // Should NOT throw — should return a result with an error message
    const result = await reExecute!(
      "call-1",
      { source: "alpha", target: "beta", kind: "calls", evidence: "test" },
      undefined,
      undefined,
      ctx,
    );
    const text = result.content[0]?.text ?? "";
    // Should indicate that the write failed, not crash
    expect(text).toContain("readonly");

    mod.resetStoreForTesting();
    chmodSync(dbPath, 0o644);
  });
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/readonly-graceful-degradation.test.ts -t "resolve_edge returns clear"`
Expected: FAIL — `error: attempt to write a readonly database` (unhandled throw from `resolveEdge` → `store.addEdge`)

**Step 3 — Write minimal implementation**

In `src/index.ts`, wrap the `resolveEdge` call in the `resolve_edge` tool's `execute` handler with a try/catch:

Change:
```typescript
      const output = resolveEdge({
        source: params.source,
        target: params.target,
        sourceFile: params.sourceFile,
        targetFile: params.targetFile,
        kind: params.kind,
        evidence: params.evidence,
        store,
        projectRoot,
      });
      return { content: [{ type: "text", text: output }], details: undefined };
```

To:
```typescript
      let output: string;
      try {
        output = resolveEdge({
          source: params.source,
          target: params.target,
          sourceFile: params.sourceFile,
          targetFile: params.targetFile,
          kind: params.kind,
          evidence: params.evidence,
          store,
          projectRoot,
        });
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        if (msg.includes("readonly")) {
          output = "Cannot write edge: database is readonly. Re-index the project to enable writes.";
        } else {
          throw err;
        }
      }
      return { content: [{ type: "text", text: output }], details: undefined };
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/readonly-graceful-degradation.test.ts -t "resolve_edge returns clear"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
