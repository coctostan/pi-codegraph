---
id: 12
title: Extension auto-indexes when store is empty and shares singleton store
status: approved
depends_on:
  - 11
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-auto-index.test.ts
---

### Task 12: Extension auto-indexes when store is empty and shares singleton store [depends: 11]

Covers AC 16, AC 17, AC 18, and AC 19.

**Files:**
- Test: `test/extension-auto-index.test.ts`
- Modify: `src/index.ts`

**Step 1 — Write the failing test**
```typescript
// test/extension-auto-index.test.ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension shares singleton store instance across symbol_graph and resolve_edge", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-singleton-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/alpha.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let reExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "resolve_edge") reExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const ctx = { cwd: projectRoot };

    await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const first = mod.getSharedStoreForTesting();

    await reExecute!(
      "call-2",
      { source: "beta", target: "alpha", kind: "calls", evidence: "beta calls alpha" },
      undefined,
      undefined,
      ctx,
    );
    const second = mod.getSharedStoreForTesting();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("extension auto-indexes project on first tool call when DB is empty", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-autoindex-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function hello() { return 'world'; }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await sgExecute!("test-call-id", { name: "hello" }, undefined, undefined, { cwd: projectRoot });

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("hello");
    expect(text).toContain("function");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-auto-index.test.ts`
Expected: FAIL — `TypeError: mod.getSharedStoreForTesting is not a function`

**Step 3 — Write minimal implementation**
```typescript
// src/index.ts
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "./graph/store.js";
import { SqliteGraphStore } from "./graph/sqlite.js";
import { indexProject } from "./indexer/pipeline.js";
import { resolveEdge } from "./tools/resolve-edge.js";
import { symbolGraph } from "./tools/symbol-graph.js";

const SymbolGraphParams = Type.Object({
  name: Type.String(),
  file: Type.Optional(Type.String()),
});

const ResolveEdgeParams = Type.Object({
  source: Type.String(),
  target: Type.String(),
  kind: Type.String(),
  evidence: Type.String(),
  sourceFile: Type.Optional(Type.String()),
  targetFile: Type.Optional(Type.String()),
});

let sharedStore: GraphStore | null = null;

export function getSharedStoreForTesting(): GraphStore | null {
  return sharedStore;
}

export function resetStoreForTesting(): void {
  if (sharedStore) sharedStore.close();
  sharedStore = null;
}

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  sharedStore = new SqliteGraphStore(join(dbDir, "graph.db"));
  return sharedStore;
}

function ensureIndexed(projectRoot: string, store: GraphStore): void {
  if (store.listFiles().length === 0) {
    indexProject(projectRoot, store);
  }
}

export default function piCodegraph(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "symbol_graph",
    label: "Symbol Graph",
    description: "Look up a symbol and return its anchored neighborhood",
    parameters: SymbolGraphParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      ensureIndexed(projectRoot, store);
      const output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });

  pi.registerTool({
    name: "resolve_edge",
    label: "Resolve Edge",
    description: "Create an edge in the symbol graph with evidence",
    parameters: ResolveEdgeParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      ensureIndexed(projectRoot, store);
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
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-auto-index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
