---
id: 3
title: Remove renderImplementationsSuffix bolt-on from src/index.ts
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/tool-symbol-graph-no-bolt-on.test.ts
---

**AC coverage:** AC 5

**Files:**
- Modify: `src/index.ts`
- Create: `test/tool-symbol-graph-no-bolt-on.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-symbol-graph-no-bolt-on.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph natively renders implements edges without bolt-on suffix", () => {
  const projectRoot = join(tmpdir(), `pi-cg-nobolt-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/iface.ts"),
    "export interface MyInterface {\n  run(): void;\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/impl.ts"),
    "export class MyImpl implements MyInterface {\n  run() {}\n}\n",
  );

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const hashIface = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/iface.ts"), "utf-8"));
    const hashImpl = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/impl.ts"), "utf-8"));

    store.addNode({ id: "src/iface.ts::MyInterface:1", kind: "interface", name: "MyInterface", file: "src/iface.ts", start_line: 1, end_line: 3, content_hash: hashIface });
    store.addNode({ id: "src/impl.ts::MyImpl:1", kind: "class", name: "MyImpl", file: "src/impl.ts", start_line: 1, end_line: 2, content_hash: hashImpl });

    store.addEdge({
      source: "src/impl.ts::MyImpl:1",
      target: "src/iface.ts::MyInterface:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "implements clause", content_hash: hashImpl },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "MyInterface", store, projectRoot });

    // Implemented By should appear natively (from symbol-graph.ts, not bolt-on)
    expect(output).toContain("### Implemented By");
    expect(output).toContain("MyImpl");

    // Should NOT have a separate "### Implementations" section (old bolt-on format)
    expect(output).not.toContain("### Implementations");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-symbol-graph-no-bolt-on.test.ts`

Expected: PASS (this test should already pass after Task 2 since `symbolGraph()` now natively renders `implements`). This task's primary purpose is the removal in Step 3. We write this test to confirm the bolt-on is unnecessary and to guard against regression.

Note: If this test already passes before the removal, that confirms the bolt-on is redundant.

**Step 3 — Write minimal implementation**

In `src/index.ts`:

1. Remove the `renderImplementationsSuffix` function (lines 98-114).
2. Remove the `computeAnchor` import (line 10) since it's only used by the bolt-on — check if any other code in `index.ts` uses it first. It is only used by `renderImplementationsSuffix`, so remove the import.
3. In the `symbol_graph` tool's `execute` method, remove:
   - Lines 144-146: the `if (resolvedNode) { output += renderImplementationsSuffix(…) }` block.

The execute method for symbol_graph should become:

```typescript
async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
  const projectRoot = ctx.cwd;
  const store = getOrCreateStore(projectRoot);
  await ensureIndexed(projectRoot, store);
  let resolvedNode: any | null = null;
  const nodes = store.findNodes(params.name, params.file);
  if (nodes.length === 1) {
    resolvedNode = nodes[0]!;
    const client = new TsServerClient(projectRoot);
    try {
      await resolveMissingCallers(resolvedNode, store, projectRoot, client);
      if (resolvedNode.kind === "interface") {
        await resolveImplementations(resolvedNode, store, projectRoot, client);
      }
    } catch {
      // Resolver writes failed (likely readonly DB) — continue with existing graph data.
    } finally {
      await client.shutdown().catch(() => {});
    }
  }

  let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
  output = indexingFailedNote() + output;
  return { content: [{ type: "text", text: output }], details: undefined };
},
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-symbol-graph-no-bolt-on.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing
