---
id: 4
title: Trust header shows indexing-failed status when ensureIndexed caught an error
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
  - test/readonly-graceful-degradation.test.ts
files_to_create: []
---

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
