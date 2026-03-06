---
id: 6
title: Persist missing caller edges from LSP references when symbol_graph is invoked
status: approved
depends_on:
  - 1
  - 3
  - 5
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - src/indexer/lsp-resolver.ts
  - test/tool-symbol-graph-lsp.test.ts
---

### Task 6: Persist missing caller edges from LSP references when `symbol_graph` is invoked [depends: 1, 3, 5]
- Create: `src/indexer/lsp-resolver.ts`
- Modify: `src/index.ts`
- Create: `test/tool-symbol-graph-lsp.test.ts`
Use a persisted resolution marker (not “any inbound lsp edge exists”) keyed by `symbolId + resolverKind` so eager indexing and lazy tool resolution can coexist.

---

#### Step 1 — Test (RED)

Create `test/tool-symbol-graph-lsp.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
import type { ITsServerClient, LspLocation } from "../src/indexer/tsserver-client.js";
test("resolveMissingCallers persists callers and writes marker; second run skips references()", async () => {
  const store = new SqliteGraphStore();

  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  const caller = {
    id: nodeId("src/impl.ts", "run", 3),
    kind: "function" as const,
    name: "run",
    file: "src/impl.ts",
    start_line: 3,
    end_line: 6,
    content_hash: "h-impl",
  };
  store.addNode(target);
  store.addNode(caller);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 4, col: 5 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);
  await resolveMissingCallers(target, store, "/project", client);

  const out = store.getEdgesBySource(caller.id).filter((e) => e.kind === "calls" && e.target === target.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});

test("resolveMissingCallers ignores self-reference at declaration location", async () => {
  const store = new SqliteGraphStore();
  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  store.addNode(target);

  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      return [{ file: "src/api.ts", line: 1, col: 17 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);

  const inEdges = store.getNeighbors(target.id, { direction: "in", kind: "calls" });
  expect(inEdges).toHaveLength(0);

  store.close();
});

test("resolveMissingCallers re-resolves after file re-index (stale marker edge cleared)", async () => {
  const store = new SqliteGraphStore();

  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  const caller = {
    id: nodeId("src/impl.ts", "run", 3),
    kind: "function" as const,
    name: "run",
    file: "src/impl.ts",
    start_line: 3,
    end_line: 6,
    content_hash: "h-impl",
  };
  store.addNode(target);
  store.addNode(caller);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 4, col: 5 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  // First resolution — sets marker
  await resolveMissingCallers(target, store, "/project", client);
  expect(calls).toBe(1);

  // Simulate file re-index: deleteFile removes symbol node and all non-agent edges
  // (including the marker→symbol edge), then re-adds the symbol.
  store.deleteFile("src/api.ts");
  store.addNode(target);
  store.addNode(caller);

  // Second resolution — marker node exists but edge was deleted → should re-resolve
  await resolveMissingCallers(target, store, "/project", client);
  expect(calls).toBe(2);  // must NOT be blocked by stale marker

  store.close();
});

test("tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-tool-lsp-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export function shared(){return 1;}\n");
  writeFileSync(join(projectRoot, "src", "impl.ts"), 'import { shared } from "./api";\nexport function run(){ shared(); }\n');

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let exec: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") exec = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await exec!("tc1", { name: "shared", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });

    const store = mod.getSharedStoreForTesting();
    const target = store.findNodes("shared", "src/api.ts")[0];
    const inbound = store.getNeighbors(target.id, { direction: "in", kind: "calls" }).filter((n) => n.edge.provenance.source === "lsp");

    expect(inbound.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Callers");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/tool-symbol-graph-lsp.test.ts
```

Expected failure:

```text
error: Cannot find module "../src/indexer/lsp-resolver.js" from "test/tool-symbol-graph-lsp.test.ts"
```

---

#### Step 3 — Implementation

1) Create `src/indexer/lsp-resolver.ts`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";
function markerNodeId(kind: "callers" | "implementations", symbolId: string): string {
  return `__meta__::resolver::${kind}::${symbolId}`;
}

function hasMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): boolean {
  const id = markerNodeId(kind, symbol.id);
  if (store.getNode(id) === null) return false;
  // After a file re-index the marker node survives but its outbound edge is deleted.
  // Only treat the marker as valid when the edge still points to the symbol.
  return store.getEdgesBySource(id).some((e) => e.target === symbol.id);
}

function setMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): void {
  const id = markerNodeId(kind, symbol.id);
  store.addNode({
    id,
    kind: "module",
    name: id,
    file: "__meta__/resolver",
    start_line: 1,
    end_line: 1,
    content_hash: "meta",
  });
  store.addEdge({
    source: id,
    target: symbol.id,
    kind: "imports",
    provenance: { source: "agent", confidence: 1, evidence: `resolved:${kind}`, content_hash: "meta" },
    created_at: Date.now(),
  });
}

function findSymbolColumn(projectRoot: string, file: string, line: number, symbolName: string): number {
  try {
    const lines = readFileSync(join(projectRoot, file), "utf8").split(/\r?\n/);
    const idx = (lines[line - 1] ?? "").indexOf(symbolName);
    return idx >= 0 ? idx + 1 : 1;
  } catch {
    return 1;
  }
}
export async function resolveMissingCallers(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "callers", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  let refs;
  try {
    refs = await client.references(node.file, node.start_line, col);
  } catch {
    return;
  }
  for (const ref of refs) {
    const callerNode = store
      .getNodesByFile(ref.file)
      .find((n) => n.kind !== "module" && n.start_line <= ref.line && (n.end_line === null || n.end_line >= ref.line));
    if (!callerNode) continue;
    if (callerNode.id === node.id) continue; // self reference/declaration

    const exists = store.getEdgesBySource(callerNode.id).some((e) => e.kind === "calls" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: callerNode.id,
      target: node.id,
      kind: "calls",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${ref.file}:${ref.line}:${ref.col}`,
        content_hash: callerNode.content_hash,
      },
      created_at: Date.now(),
    });
  }

  setMarker(store, "callers", node);
}
```

2) Modify `src/index.ts` in `symbol_graph` handler to call resolver before rendering:

```typescript
import { resolveMissingCallers } from "./indexer/lsp-resolver.js";
import { TsServerClient } from "./indexer/tsserver-client.js";
// inside symbol_graph execute
const nodes = store.findNodes(params.name, params.file);
if (nodes.length === 1) {
  const client = new TsServerClient(projectRoot);
  try {
    await resolveMissingCallers(nodes[0]!, store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
}
```

---

#### Step 4 — Run (PASS)

```bash
bun test test/tool-symbol-graph-lsp.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.
