---
id: 13
title: "token-tracker: integrate _meta line into symbol_graph tool"
status: approved
depends_on:
  - 12
  - 5
no_test: false
files_to_modify:
  - src/tools/token-tracker.ts
  - src/index.ts
files_to_create:
  - test/token-tracker-symbol-graph-integration.test.ts
---

### Task 13: token-tracker: integrate _meta line into symbol_graph tool [depends: 12, 5]

**Files:**
- Modify: `src/index.ts`
- Create: `test/token-tracker-symbol-graph-integration.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/token-tracker-symbol-graph-integration.test.ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession } from "../src/tools/token-tracker.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { appendTokenMeta } from "../src/tools/token-tracker.js";

beforeEach(() => {
  resetSession();
});

test("appendTokenMeta appends _meta line with token stats to tool output", () => {
  const projectRoot = join(tmpdir(), `pi-cg-meta-sg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });

    const text = symbolGraph({ name: "foo", store, projectRoot });
    const output = appendTokenMeta("symbol_graph", { name: "foo" }, text, store, projectRoot);

    expect(output).toContain("_meta:");
    expect(output).toContain("tokens_saved:");
    expect(output).toContain("naive_tokens:");
    expect(output).toContain("actual_tokens:");
    expect(output).toContain("session_calls:1");
    expect(output).toContain("session_tokens_saved:");
    // The _meta line should be at the end
    const lines = output.trim().split("\n");
    expect(lines[lines.length - 1]).toMatch(/^_meta:/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/token-tracker-symbol-graph-integration.test.ts`
Expected: FAIL — `error: "appendTokenMeta" is not exported from "../src/tools/token-tracker.js"`

**Step 3 — Write minimal implementation**

Add `appendTokenMeta` to `src/tools/token-tracker.ts`:

```typescript
export function appendTokenMeta(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const naiveFiles = collectNaiveFiles(toolName, params, store);
  const naiveTokens = estimateNaiveCost(naiveFiles, projectRoot);
  const actualTokens = Math.floor(toolOutput.length / 4);
  const metaLine = formatMetaLine(toolName, naiveTokens, actualTokens);
  return `${toolOutput}\n${metaLine}`;
}
```

Then update `src/index.ts` — modify the `symbol_graph` execute handler to use `appendTokenMeta`:

Add import:
```typescript
import { appendTokenMeta, resetSession } from "./tools/token-tracker.js";
```

Update `resetStoreForTesting`:
```typescript
export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
  lastIndexError = null;
  resetSession();
}
```

Update `symbol_graph` execute wrapper:
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
        } finally {
          await client.shutdown().catch(() => {});
        }
      }

      let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_graph", { name: params.name, file: params.file }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/token-tracker-symbol-graph-integration.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
