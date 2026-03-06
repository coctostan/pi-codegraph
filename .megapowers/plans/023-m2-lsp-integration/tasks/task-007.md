---
id: 7
title: Persist interface implementation edges from LSP and avoid repeat
  tool-time queries
status: approved
depends_on:
  - 1
  - 3
  - 5
  - 6
no_test: false
files_to_modify:
  - src/indexer/lsp-resolver.ts
  - src/index.ts
  - test/tool-symbol-graph-lsp.test.ts
files_to_create: []
---

### Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries [depends: 1, 3, 5, 6]
- Modify: `src/indexer/lsp-resolver.ts`
- Modify: `src/index.ts`
- Modify: `test/tool-symbol-graph-lsp.test.ts`
Use the same persisted marker strategy as Task 6 (symbol id + resolver kind), set confidence to `0.9`, and add tool-path coverage for interface output.

---

#### Step 1 — Test (RED)

First, update the existing import at the top of `test/tool-symbol-graph-lsp.test.ts`:

```typescript
// Replace existing import line:
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
// With:
import { resolveMissingCallers, resolveImplementations } from "../src/indexer/lsp-resolver.js";
```

Then append the following tests to the end of the file:

```typescript
test("resolveImplementations persists implements edges and marker; second run skips implementations()", async () => {
  const store = new SqliteGraphStore();

  const iface = {
    id: nodeId("src/api.ts", "IWorker", 2),
    kind: "interface" as const,
    name: "IWorker",
    file: "src/api.ts",
    start_line: 2,
    end_line: 3,
    content_hash: "h-api",
  };
  const impl = {
    id: nodeId("src/impl.ts", "Worker", 1),
    kind: "class" as const,
    name: "Worker",
    file: "src/impl.ts",
    start_line: 1,
    end_line: 4,
    content_hash: "h-impl",
  };
  store.addNode(iface);
  store.addNode(impl);

  let calls = 0;
  const client: ITsServerClient = {
    async implementations(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 1, col: 14 }];
    },
    async definition() { return null; },
    async references() { return []; },
    async shutdown() {},
  };

  await resolveImplementations(iface, store, "/project", client);
  await resolveImplementations(iface, store, "/project", client);

  const out = store.getEdgesBySource(impl.id).filter((e) => e.kind === "implements" && e.target === iface.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});

test("tool path: interface symbol_graph resolves implementations, persists edge, and renders Implementations section", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-interface-lsp-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export interface IWorker { run(): void }\n");
  writeFileSync(join(projectRoot, "src", "impl.ts"), "export class Worker implements IWorker { run(): void {} }\n");

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
    const result = await exec!("tc-intf", { name: "IWorker", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });

    const store = mod.getSharedStoreForTesting();
    const ifaceNode = store.findNodes("IWorker", "src/api.ts")[0]!;
    const implIn = store.getNeighbors(ifaceNode.id, { direction: "in", kind: "implements" }).filter((n) => n.edge.provenance.source === "lsp");

    expect(implIn.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Implementations");
    expect(result.content[0].text).toContain("Worker");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("non-interface symbol_graph output remains unchanged (no Implementations section)", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-non-interface-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "x.ts"), "export function hello(){ return 1; }\n");

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
    const result = await exec!("tc-fn", { name: "hello", file: "src/x.ts" }, undefined, undefined, { cwd: projectRoot });

    expect(result.content[0].text).not.toContain("Implementations");
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
error: Export named 'resolveImplementations' not found in module '../src/indexer/lsp-resolver.js'
```

---

#### Step 3 — Implementation

1) Modify `src/indexer/lsp-resolver.ts`:

```typescript
export async function resolveImplementations(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "implementations", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  let impls;
  try {
    impls = await client.implementations(node.file, node.start_line, col);
  } catch {
    return;
  }

  for (const implLoc of impls) {
    const implNode = store
      .getNodesByFile(implLoc.file)
      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));

    if (!implNode) continue;

    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: implNode.id,
      target: node.id,
      kind: "implements",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${implLoc.file}:${implLoc.line}:${implLoc.col}`,
        content_hash: implNode.content_hash,
      },
      created_at: Date.now(),
    });
  }

  setMarker(store, "implementations", node);
}
```

2) Modify `src/index.ts` `symbol_graph` handler:

```typescript
import { computeAnchor } from "./output/anchoring.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
function renderImplementationsSuffix(store: GraphStore, node: any, projectRoot: string): string {
  if (node.kind !== "interface") return "";

  const impl = store
    .getNeighbors(node.id, { direction: "in", kind: "implements" })
    .filter((n) => n.edge.provenance.source === "lsp");

  if (impl.length === 0) return "";

  const lines = ["", "### Implementations"];
  for (const it of impl) {
    const anchor = computeAnchor(it.node, projectRoot);
    lines.push(`  ${anchor.anchor}  ${it.node.name}  implements  confidence:${it.edge.provenance.confidence}  ${it.edge.provenance.source}`);
  }
  return lines.join("\n") + "\n";
}

// inside symbol_graph execute
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
  } finally {
    await client.shutdown().catch(() => {});
  }
}

let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
if (resolvedNode) {
  output += renderImplementationsSuffix(store, resolvedNode, projectRoot);
}
```

This keeps non-interface output identical unless the queried symbol is an interface with resolved implementations.

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
