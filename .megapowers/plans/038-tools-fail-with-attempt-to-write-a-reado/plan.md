# Plan

### Task 1: ensureIndexed catches indexing errors and records failure for trust header

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

### Task 2: symbol_graph lazy resolver handles write failures without crashing [depends: 1]

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

### Task 3: resolve_edge returns clear error message when DB is readonly [depends: 1]

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

### Task 4: Trust header shows indexing-failed status when ensureIndexed caught an error [depends: 1]

### Task 4: Trust header shows indexing-failed status when ensureIndexed caught an error [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Test: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Write the failing test**

Add to the `describe` block in `test/readonly-graceful-degradation.test.ts`:

```typescript
  test("tool output trust header indicates indexing-failed when DB is readonly", async () => {
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

    // Modify source to trigger indexing attempt
    writeFileSync(
      join(projectRoot, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\nexport function delta() { return 99; }\n",
    );

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let impactExecute: Function | undefined;
    let traceExecute: Function | undefined;
    let gqExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "impact") impactExecute = tool.execute;
        if (tool.name === "trace") traceExecute = tool.execute;
        if (tool.name === "graph_query") gqExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);

    chmodSync(dbPath, 0o444);
    const ctx = { cwd: projectRoot };

    // All 4 read tools should include "indexing-failed" in their trust header
    const sgResult = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
    expect(sgResult.content[0]?.text ?? "").toContain("indexing-failed");

    // Reset singleton for next tool (they all share the store, so only need one check
    // but verify at least two different tools show the header)
    const gqResult = await gqExecute!("c2", { query: 'MATCH (n {name: "alpha"}) RETURN n' }, undefined, undefined, ctx);
    expect(gqResult.content[0]?.text ?? "").toContain("indexing-failed");

    mod.resetStoreForTesting();
    chmodSync(dbPath, 0o644);
  });
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/readonly-graceful-degradation.test.ts -t "trust header"`
Expected: FAIL — `expect(received).toContain(expected)` — Expected to contain: `"indexing-failed"` (trust header currently shows `"fresh"` or `"stale"`, never `"indexing-failed"`)

**Step 3 — Write minimal implementation**

In `src/index.ts`, thread the `lastIndexError` state into the tool output. After `ensureIndexed`, if there was an error, inject an `indexing-failed` note into the output.

Change each read tool's execute body to append the indexing-failed note. The simplest approach is a helper function:

Add after the `ensureIndexed` function:

```typescript
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "\nindexing-failed: graph may be stale (readonly database)\n";
}
```

Then in each of the 4 read tools' execute handlers, after the output is computed and before return, prepend the note:

For `symbol_graph`:
```typescript
      let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      if (resolvedNode) {
        output += renderImplementationsSuffix(store, resolvedNode, projectRoot);
      }
      output = indexingFailedNote() + output;
      return { content: [{ type: "text", text: output }], details: undefined };
```

For `impact`:
```typescript
      const text = impact({ ... });
      return { content: [{ type: "text", text: indexingFailedNote() + text }], details: undefined };
```

For `trace`:
```typescript
      const text = trace({ ... });
      return { content: [{ type: "text", text: indexingFailedNote() + text }], details: undefined };
```

For `graph_query`:
```typescript
      const text = graphQuery({ ... });
      return { content: [{ type: "text", text: indexingFailedNote() + text }], details: undefined };
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/readonly-graceful-degradation.test.ts -t "trust header"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Remove superseded bug-reproduction tests and verify full suite [no-test] [depends: 1, 2, 3, 4]

### Task 5: Remove superseded bug-reproduction tests and verify full suite [depends: 1, 2, 3, 4] [no-test]

**Justification:** The two "BUG REPRODUCED" tests were written during the reproduce phase to document the broken behavior. After Tasks 1-4, the bug is fixed and the behavior has changed — those tests either fail (they assert the old broken behavior) or are no longer meaningful. The new tests from Tasks 1-4 replace them as regression tests.

**Files:**
- Modify: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Make the change**

Remove these two tests from `test/readonly-graceful-degradation.test.ts`:

1. `"BUG REPRODUCED: indexProject crashes on readonly DB when LSP stage tries to write edges"` (around lines 150-190)
2. `"BUG REPRODUCED: extension execute() propagates readonly crash, user gets no results"` (around lines 193-260)

These are the tests that assert `expect(true).toBe(true)` or document that errors propagate. They are replaced by the fix-verification tests from Tasks 1-4.

**Step 2 — Verify**
Run: `bun test`
Expected: All tests pass. The final test file should have:
- 4 original evidence tests (writes fail, reads work, symbol_graph reads, graph_query reads)
- 4 fix-verification tests (ensureIndexed catches, lazy resolver, resolve_edge, trust header)
