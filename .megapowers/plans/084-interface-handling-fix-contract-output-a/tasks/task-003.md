---
id: 3
title: Filter LSP implementation edges by declared implements clauses
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/lsp-resolver.ts
  - test/tool-symbol-graph-lsp.test.ts
  - test/repro-084-interface-handling.test.ts
files_to_create: []
---

### Task 3: Filter LSP implementation edges by declared `implements` clauses [depends: 1]

**Files:**
- Modify: `src/indexer/lsp-resolver.ts`
- Modify: `test/tool-symbol-graph-lsp.test.ts`
- Test: `test/repro-084-interface-handling.test.ts`

**Step 1 — Write the failing test**
Keep the existing `repro #077` regression in `test/repro-084-interface-handling.test.ts` as the task’s failing test, and update the positive unit fixture in `test/tool-symbol-graph-lsp.test.ts` so the stricter resolver still has an explicit declaration to validate against.

`test/repro-084-interface-handling.test.ts` should keep this exact negative test block:

```ts
test("repro #077: resolveImplementations should not add an implements edge from a return-site match", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-077-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const storeFile = [
    "export interface GraphStatistics {",
    "  nodes: Record<string, number>;",
    "  edges: Record<string, Record<string, number>>;",
    "  files: { total: number; stale: number };",
    "}",
    "",
    "export interface GraphStore {",
    "  getStatistics(): GraphStatistics;",
    "}",
    "",
  ].join("\n");
  const sqliteFile = [
    'import type { GraphStatistics, GraphStore } from "./store.js";',
    "",
    "export class SqliteGraphStore implements GraphStore {",
    "  getStatistics(): GraphStatistics {",
    "    const nodes = {};",
    "    const edges = {};",
    "    const total = 0;",
    "    const stale = 0;",
    "    return { nodes, edges, files: { total, stale } };",
    "  }",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "store.ts"), storeFile);
  writeFileSync(join(projectRoot, "src", "sqlite.ts"), sqliteFile);

  const store = new SqliteGraphStore();
  try {
    addIndexedFile(store, "src/store.ts", storeFile);
    addIndexedFile(store, "src/sqlite.ts", sqliteFile);

    const graphStatistics = store.findNodes("GraphStatistics", "src/store.ts")[0]!;
    const sqliteGraphStore = store.findNodes("SqliteGraphStore", "src/sqlite.ts")[0]!;

    const client: ITsServerClient = {
      async implementations() {
        return [{ file: "src/sqlite.ts", line: 9, col: 12 }];
      },
      async definition() {
        return null;
      },
      async references() {
        return [];
      },
      async shutdown() {},
    };

    await resolveImplementations(graphStatistics, store, projectRoot, client);

    const implementsEdges = store
      .getEdgesBySource(sqliteGraphStore.id)
      .filter((edge) => edge.kind === "implements" && edge.target === graphStatistics.id && edge.provenance.source === "lsp");

    expect(implementsEdges).toHaveLength(0);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update the positive unit fixture in `test/tool-symbol-graph-lsp.test.ts` to this exact block so the stricter declaration check still has ground-truth signature data:

```ts
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
    signature: "class Worker implements IWorker",
  };
  store.addNode(iface);
  store.addNode(impl);

  let calls = 0;
  const client: ITsServerClient = {
    async implementations(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 1, col: 14 }];
    },
    async definition() {
      return null;
    },
    async references() {
      return [];
    },
    async shutdown() {},
  };

  await resolveImplementations(iface, store, "/project", client);
  await resolveImplementations(iface, store, "/project", client);

  const out = store
    .getEdgesBySource(impl.id)
    .filter((e) => e.kind === "implements" && e.target === iface.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/repro-084-interface-handling.test.ts test/tool-symbol-graph-lsp.test.ts -t 'repro #077|resolveImplementations persists implements edges and marker; second run skips implementations\(\)'`
Expected: FAIL — `error: expect(received).toHaveLength(expected)` with `Expected length: 0` and `Received length: 1` for the false `GraphStatistics` implements edge.

**Step 3 — Write minimal implementation**
In `src/indexer/lsp-resolver.ts`, teach the LSP-success path to validate the class declaration before persisting a class-level `implements` edge. Use the stored class signature when available, and only fall back to reading the file declaration when the signature is missing.

```ts
function signatureImplementsInterface(signature: string | undefined, interfaceName: string): boolean {
  if (!signature) return false;
  const rx = new RegExp(`\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`);
  return rx.test(signature);
}

function classImplementsInterface(
  projectRoot: string,
  file: string,
  className: string,
  interfaceName: string,
  signature?: string,
): boolean {
  if (signature != null) {
    return signatureImplementsInterface(signature, interfaceName);
  }

  try {
    const content = readFileSync(join(projectRoot, file), "utf8");
    const rx = new RegExp(
      `\\bclass\\s+${escapeRegex(className)}\\b[^\\{]*\\bimplements\\b[^\\{]*\\b${escapeRegex(interfaceName)}\\b`,
      "m",
    );
    return rx.test(content);
  } catch {
    return false;
  }
}

export async function resolveImplementations(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "implementations", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  const addFallbackImplementations = () => {
    for (const file of store.listFiles()) {
      for (const classNode of store.getNodesByFile(file).filter((n) => n.kind === "class")) {
        if (!classImplementsInterface(projectRoot, classNode.file, classNode.name, node.name, classNode.signature)) continue;
        const exists = store
          .getEdgesBySource(classNode.id)
          .some((e) => e.kind === "implements" && e.target === node.id);
        if (exists) continue;
        store.addEdge({
          source: classNode.id,
          target: node.id,
          kind: "implements",
          provenance: {
            source: "lsp",
            confidence: 0.9,
            evidence: `${classNode.file}:${classNode.start_line}:1`,
            content_hash: classNode.content_hash,
          },
          created_at: Date.now(),
        });
      }
    }
    setMarker(store, "implementations", node);
  };

  let impls;
  try {
    impls = await client.implementations(node.file, node.start_line, col);
  } catch {
    addFallbackImplementations();
    return;
  }

  if (!impls || impls.length === 0) {
    addFallbackImplementations();
    return;
  }

  for (const implLoc of impls) {
    const implNode = store
      .getNodesByFile(implLoc.file)
      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));

    if (!implNode) continue;
    if (!classImplementsInterface(projectRoot, implNode.file, implNode.name, node.name, implNode.signature)) continue;

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

**Step 4 — Run test, verify it passes**
Run: `bun test test/repro-084-interface-handling.test.ts test/tool-symbol-graph-lsp.test.ts -t 'repro #077|resolveImplementations persists implements edges and marker; second run skips implementations\(\)'`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
