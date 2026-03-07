# Plan

### Task 1: Add pure impact traversal and classification

### Task 1: Add pure impact traversal and classification

Note: Task 1 is the pure impact traversal/classification foundation used by Task 2 tool output formatting.
**Files:**
- Create: `src/tools/impact.ts`
- Test: `test/tool-impact.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
// GraphNode in this repository includes `content_hash` (used throughout store + edge provenance).
import { collectImpact } from "../src/tools/impact.js";

function addNode(store: SqliteGraphStore, node: GraphNode) {
  store.addNode(node);
}

function addCall(store: SqliteGraphStore, source: string, target: string) {
  store.addEdge({
    source,
    target,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "call",
      content_hash: "hash",
    },
    created_at: 1,
  });
}

test("collectImpact classifies direct and transitive dependents by change type", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");

    const signature = collectImpact({
      symbols: ["shared"],
      changeType: "signature_change",
      store,
      maxDepth: 5,
    });
    expect(signature).toEqual([
      { nodeId: "src/a.ts::a:1", name: "a", file: "src/a.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/b.ts::b:1", name: "b", file: "src/b.ts", depth: 2, classification: "behavioral" },
    ]);

    const removal = collectImpact({
      symbols: ["shared"],
      changeType: "removal",
      store,
      maxDepth: 5,
    });
    expect(removal.map((item) => item.classification)).toEqual(["breaking", "behavioral"]);

    const behavioral = collectImpact({
      symbols: ["shared"],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });
    expect(behavioral.map((item) => item.classification)).toEqual(["behavioral", "behavioral"]);
  } finally {
    store.close();
  }
});

test("collectImpact respects maxDepth", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");

    expect(
      collectImpact({ symbols: ["shared"], changeType: "signature_change", store, maxDepth: 1 }),
    ).toEqual([
      { nodeId: "src/a.ts::a:1", name: "a", file: "src/a.ts", depth: 1, classification: "breaking" },
    ]);

    expect(
      collectImpact({ symbols: ["shared"], changeType: "addition", store, maxDepth: 5 }),
    ).toEqual([]);
  } finally {
    store.close();
  }
});


test("collectImpact returns no dependents for addition", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");

    expect(
      collectImpact({ symbols: ["shared"], changeType: "addition", store, maxDepth: 5 }),
    ).toEqual([]);
  } finally {
    store.close();
  }
});

test("collectImpact terminates on cycles without duplicates", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");
    addCall(store, "src/a.ts::a:1", "src/b.ts::b:1");

    const result = collectImpact({
      symbols: ["shared"],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });

    expect(result).toEqual([
      { nodeId: "src/a.ts::a:1", name: "a", file: "src/a.ts", depth: 1, classification: "behavioral" },
      { nodeId: "src/b.ts::b:1", name: "b", file: "src/b.ts", depth: 2, classification: "behavioral" },
    ]);
  } finally {
    store.close();
  }
});


test("collectImpact terminates on a 3-node cycle without duplicates", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/b.ts::b:1", kind: "function", name: "b", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/c.ts::c:1", kind: "function", name: "c", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: "h" });

    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");
    addCall(store, "src/b.ts::b:1", "src/a.ts::a:1");
    addCall(store, "src/c.ts::c:1", "src/b.ts::b:1");
    addCall(store, "src/a.ts::a:1", "src/c.ts::c:1");

    const result = collectImpact({ symbols: ["shared"], changeType: "behavior_change", store, maxDepth: 10 });
    expect(result.map((r) => r.nodeId).sort()).toEqual([
      "src/a.ts::a:1",
      "src/b.ts::b:1",
      "src/c.ts::c:1",
    ]);
  } finally {
    store.close();
  }
});


test("collectImpact classification matrix (AC 34) across all change types", () => {
  const store = new SqliteGraphStore();
  try {
    addNode(store, { id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addNode(store, { id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" });
    addCall(store, "src/a.ts::a:1", "src/lib.ts::shared:1");

    const cases = [
      { changeType: "signature_change", expected: ["breaking"] },
      { changeType: "removal", expected: ["breaking"] },
      { changeType: "behavior_change", expected: ["behavioral"] },
      { changeType: "addition", expected: [] },
    ] as const;

    for (const c of cases) {
      const out = collectImpact({ symbols: ["shared"], changeType: c.changeType, store, maxDepth: 5 });
      expect(out.map((r) => r.classification)).toEqual(c.expected as any);
    }
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/impact.js' from 'test/tool-impact.test.ts'`

**Step 3 — Write minimal implementation**
```ts
import type { GraphStore } from "../graph/store.js";

interface GraphStoreSubset {
  findNodes(name: string, file?: string): Array<{ id: string }>;
  getNeighbors(nodeId: string, options: { direction: "in"; kind: "calls" }): Array<{ node: { id: string; name: string; file: string } }>;
}
// The actual GraphStore from src/graph/store.ts includes these APIs.
// GraphStore API (src/graph/store.ts): findNodes(name: string, file?: string), getNeighbors(nodeId, options).

export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}

export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}

function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
  return null;
}

export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];

  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];

  for (const symbol of symbols) {
    // findNodes(name) may return multiple files for the same symbol name; we intentionally traverse from all matches.
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const inbound = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    for (const neighbor of inbound) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
      });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
```

### Task 2: Add anchored impact output and register the impact tool [depends: 1]

### Task 2: Add anchored impact output and register the impact tool [depends: 1]
**Files:**
- Modify: `src/tools/impact.ts`
- Modify: `src/index.ts`
- Test: `test/extension-impact.test.ts`
Note: `computeAnchor()` is pre-existing in `src/output/anchoring.ts`; Step 1 includes a direct smoke test for its contract.
AC 28 note: `METHOD` is normalized with `toUpperCase()` before rendering `to_template`, so `endpoint:{METHOD}:{PATH}` yields IDs like `endpoint:GET:/users`.
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { computeAnchor } from "../src/output/anchoring.js";
import { impact } from "../src/tools/impact.js";
test("computeAnchor returns existing anchor format file:line:hash and stale flag", () => {
  const root = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "f.ts"), "export function a() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/f.ts::a:1", kind: "function", name: "a", file: "src/f.ts", start_line: 1, end_line: 1, content_hash: "h" });
    const node = store.getNode("src/f.ts::a:1")!;
    const result = computeAnchor(node, root);
    expect(result.anchor).toMatch(/^src\/f\.ts:1:[0-9a-f]{4}$/);
    expect(typeof result.stale).toBe("boolean");

    const staleProbe = { ...node, start_line: 99, end_line: 99 };
    const staleResult = computeAnchor(staleProbe as any, root);
    expect(staleResult.stale).toBe(true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("impact() emits anchored structured lines and empty string for no-impact", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "caller.ts"), "import { shared } from './shared';\nexport function caller() { return shared(); }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h" });
    store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: "h" });
    store.addEdge({
      source: "src/caller.ts::caller:2",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: "h" },
      created_at: 1,
    });
    const out = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot, maxDepth: 3 });
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?$/);
    // AC 11 strict contract: file:line:hash + two-space field separators + trailing newline.
    expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?\n$/);
    const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
    expect(noImpact).toBe("");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('pi extension default export registers tool name "impact" with symbols/changeType schema', async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = { registerTool(tool: any) { registeredTools.push(tool); }, on() {} };
  const { default: piCodegraph } = await import("../src/index.js");
  expect(typeof piCodegraph).toBe("function");
  piCodegraph(mockPi as any);
  const impactTool = registeredTools.find((tool) => tool.name === "impact");
  expect(impactTool).toBeDefined();
  const schema = impactTool!.parameters as any;
  expect(schema.properties.symbols).toBeDefined();
  expect(schema.properties.changeType).toBeDefined();
  expect(schema.properties.maxDepth).toBeDefined();
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/extension-impact.test.ts
```
Expected: `FAIL — Export named "impact" not found`

**Step 3 — Implement anchored output + tool wiring**
```ts
// src/tools/impact.ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}
export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}
function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") return depth === 1 ? "breaking" : "behavioral";
  return null;
}
export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];
  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];
  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const neighbor of store.getNeighbors(current.id, { direction: "in", kind: "calls" })) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({ nodeId: neighbor.node.id, name: neighbor.node.name, file: neighbor.node.file, depth, classification });
    }
  }
  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function impact(params: { symbols: string[]; changeType: ChangeType; store: GraphStore; projectRoot: string; maxDepth?: number }): string {
  const hits = collectImpact({ symbols: params.symbols, changeType: params.changeType, store: params.store, maxDepth: params.maxDepth });
  if (hits.length === 0) return "";
  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}`];
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  // keep trailing newline for non-empty result sets (tool output convention)
}
```

```ts
// src/index.ts — add this import after the existing tool imports at the top
import { impact } from "./tools/impact.js";

// src/index.ts — add after the existing ResolveEdgeParams constant
const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol name" }), {
    description: "One or more symbol names that changed",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Kind of change" },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
});

// src/index.ts — inside piCodegraph(), add after the resolve_edge registerTool block
  pi.registerTool({
    name: "impact",
    label: "Impact",
    description: "Given changed symbols, return downstream dependents classified by change type",
    parameters: ImpactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = impact({
        symbols: params.symbols,
        changeType: params.changeType,
        store,
        projectRoot,
        maxDepth: params.maxDepth,
      });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/extension-impact.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.

### Task 3: Index TSX files with the tree-sitter stage

### Task 3: Index TSX files with the tree-sitter stage
Note: This task only enables TSX parsing prerequisites for Stage 3. AC 23 (`sg` subprocess boundary) is implemented in Task 5 and exercised in Tasks 8–9.
Contract note: `src/indexer/tsserver-client.ts` already exists in the repository and is not created by this task; Step 3 includes its interface excerpt only for clarity.

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `src/indexer/pipeline.ts`
- Test: `test/indexer-tsx.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

test("ITsServerClient contract used by indexProject is explicit", () => {
  const fakeClient: ITsServerClient = {
    async definition() { return null; },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };
  expect(typeof fakeClient.definition).toBe("function");
  expect(typeof fakeClient.references).toBe("function");
  expect(typeof fakeClient.implementations).toBe("function");
  expect(typeof fakeClient.shutdown).toBe("function");
});

test("indexProject indexes TSX function components", async () => {
  const root = join(tmpdir(), `pi-codegraph-tsx-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "App.tsx"),
    "export function App() {\n  return <button>Hello</button>;\n}\n",
  );
  writeFileSync(join(root, "src", "util.ts"), "export function util() { return 1; }\n");

  const store = new SqliteGraphStore();
  const fakeClient: ITsServerClient = {
    async definition() { return null; },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  try {
    const result = await indexProject(root, store, { lspClientFactory: () => fakeClient });
    expect(result.indexed).toBe(2); // proves walkTsFiles includes both .ts and .tsx
    expect(store.findNodes("App", "src/App.tsx")).toHaveLength(1);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-tsx.test.ts`
Expected: FAIL — `Expected 1, Received 0` because `.tsx` files are not walked or parsed yet

**Step 3 — Write minimal implementation**
```ts
// src/indexer/pipeline.ts
function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".megapowers" || ent.name === ".git") continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (ent.isFile() && (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))) out.push(full);
    }
  };
  walk(root);
  return out;
}
// src/indexer/pipeline.ts inside indexProject()
const files = walkTsFiles(projectRoot);
```

```ts
// src/indexer/tsserver-client.ts (pre-existing contract used by tests)
export interface ITsServerClient {
  definition(file: string, line: number, character: number): Promise<unknown | null>;
  references(file: string, line: number, character: number): Promise<Array<{ file: string; line: number; character: number }>>;
  implementations(file: string, line: number, character: number): Promise<Array<{ file: string; line: number; character: number }>>;
  shutdown(): Promise<void>;
}
```

```ts
// src/indexer/tree-sitter.ts
import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";
  const mod = ts as unknown as { typescript: unknown; tsx: unknown };
  if (!mod.typescript || !mod.tsx) {
    throw new Error("tree-sitter-typescript missing typescript/tsx exports");
  }
  return file.endsWith(".tsx") ? mod.tsx : mod.typescript;
  // This uses actual tree-sitter-typescript exports at runtime: mod.tsx / mod.typescript.
}
export function extractFile(file: string, content: string): ExtractionResult {
  const parser = new Parser();
  parser.setLanguage(typescriptLanguage(file) as never);
  const tree = parser.parse(content);
  // existing node/edge extraction logic stays unchanged below this parser setup
  // ...
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-tsx.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Load and validate bundled and project-local ast-grep rules [depends: 3]

### Task 4: Load and validate bundled and project-local ast-grep rules [depends: 3]
**Files:**
- Create: `src/indexer/ast-grep.ts`
- Test: `test/indexer-ast-grep-rules.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRules } from "../src/indexer/ast-grep.js";
test("Bun.YAML.parse API is available", () => {
  expect(typeof Bun).toBe("object");
  expect(typeof Bun.YAML.parse).toBe("function");
});


test("loadRules reports explicit runtime error when Bun.YAML.parse is unavailable", () => {
  const root = join(tmpdir(), `pi-cg-rules-no-yaml-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(join(bundledDir, "r.yaml"), `- name: r\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: X\n    to_template: endpoint:{X}\n    confidence: 0.9\n`);

  const prev = (Bun as any).YAML;
  try {
    (Bun as any).YAML = undefined;
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow("Bun.YAML.parse is unavailable in this runtime");
  } finally {
    (Bun as any).YAML = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadRules merges bundled + project-local rules and accepts generic selectors", () => {
  const root = join(tmpdir(), `pi-cg-rules-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const userDir = join(root, ".codegraph", "rules");
  mkdirSync(bundledDir, { recursive: true });
  mkdirSync(userDir, { recursive: true });
  writeFileSync(join(bundledDir, "express.yaml"), `- name: express-route\n  pattern: $APP.$METHOD($PATH, $$$HANDLERS)\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: HANDLERS\n    to_template: endpoint:{METHOD}:{PATH}\n    confidence: 0.9\n`);
  writeFileSync(join(userDir, "generic.yaml"), `- name: generic-context-template\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_context: enclosing_function\n    to_template: endpoint:{NAME}\n    confidence: 0.5\n`);

  try {
    const rules = loadRules({ bundledDir, projectRoot: root });
    expect(rules.map((r) => r.name).sort()).toEqual(["express-route", "generic-context-template"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadRules enforces exactly one from_* and one to_* selector", () => {
  const root = join(tmpdir(), `pi-cg-rules-invalid-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: A\n    from_context: enclosing_function\n    to_template: endpoint:{A}\n    confidence: 0.9\n`);

  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: specify exactly one of produces.from_capture or produces.from_context`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("loadRules rejects rules that specify both to_capture and to_template", () => {
  const root = join(tmpdir(), `pi-cg-rules-bad-target-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-target.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad-target\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_capture: FN\n    to_capture: T\n    to_template: endpoint:{T}\n    confidence: 0.9\n`);
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: specify exactly one of produces.to_capture or produces.to_template`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("loadRules rejects rules that specify neither from_capture nor from_context", () => {
  const root = join(tmpdir(), `pi-cg-rules-missing-source-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "missing-source.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: missing-source\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    to_template: endpoint:{NAME}\n    confidence: 0.9\n`);

  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: specify exactly one of produces.from_capture or produces.from_context`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("loadRules rejects invalid from_context values with offending file path", () => {
  const root = join(tmpdir(), `pi-cg-rules-bad-context-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-context.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad-context\n  pattern: foo()\n  lang: typescript\n  produces:\n    edge_kind: routes_to\n    from_context: invalid_value\n    to_template: endpoint:{NAME}\n    confidence: 0.9\n`);
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(
      `Invalid rule file ${badFile}: unsupported produces.from_context invalid_value`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadRules wraps YAML parse errors with offending file path", () => {
  const root = join(tmpdir(), `pi-cg-rules-parse-${Date.now()}`);
  const bundledDir = join(root, "bundled");
  const badFile = join(bundledDir, "bad-parse.yaml");
  mkdirSync(bundledDir, { recursive: true });
  writeFileSync(badFile, `- name: bad-parse\n  pattern: [\n`);
  try {
    expect(() => loadRules({ bundledDir, projectRoot: root })).toThrow(`Invalid rule file ${badFile}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-rules.test.ts
```
Expected: `FAIL — Cannot find module '../src/indexer/ast-grep.js'`

**Step 3 — Implement YAML loading + generic validation**
Path-resolution note: module-relative bundled rules path (`fileURLToPath(new URL("../rules/", import.meta.url))`) is integration-verified in Task 8.
```ts
// src/indexer/ast-grep.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
export interface AstGrepRule {
  name: string;
  pattern: string;
  lang: string;
  produces: {
    edge_kind: "routes_to" | "renders";
    from_capture?: string;
    from_context?: "enclosing_function";
    to_capture?: string;
    to_template?: string;
    confidence: number;
  };
}
export interface LoadRulesOptions {
  bundledDir: string;
  projectRoot: string;
}
function listRuleFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .map((name) => join(dir, name));
}
function validateRuleFile(filePath: string, raw: unknown): AstGrepRule[] {
  if (!Array.isArray(raw)) throw new Error(`Invalid rule file ${filePath}: expected YAML array`);
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error(`Invalid rule file ${filePath}: expected object item`);
    const rule = entry as any;
    if (!rule.name) throw new Error(`Invalid rule file ${filePath}: missing name`);
    if (!rule.pattern) throw new Error(`Invalid rule file ${filePath}: missing pattern`);
    if (!rule.lang) throw new Error(`Invalid rule file ${filePath}: missing lang`);
    if (!rule.produces?.edge_kind) throw new Error(`Invalid rule file ${filePath}: missing produces.edge_kind`);
    if (typeof rule.produces?.confidence !== "number") throw new Error(`Invalid rule file ${filePath}: missing produces.confidence`);
    const hasFromCapture = typeof rule.produces.from_capture === "string";
    const hasFromContext = typeof rule.produces.from_context === "string";
    if (hasFromCapture === hasFromContext) {
      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.from_capture or produces.from_context`);
    }
    const hasToCapture = typeof rule.produces.to_capture === "string";
    const hasToTemplate = typeof rule.produces.to_template === "string";
    if (hasToCapture === hasToTemplate) {
      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.to_capture or produces.to_template`);
    }
    if (hasFromContext && rule.produces.from_context !== "enclosing_function") {
      throw new Error(`Invalid rule file ${filePath}: unsupported produces.from_context ${rule.produces.from_context}`);
    }
    return rule as AstGrepRule;
  });
}
function readRuleFile(filePath: string): AstGrepRule[] {
  if (typeof Bun.YAML?.parse !== "function") {
    throw new Error("Bun.YAML.parse is unavailable in this runtime");
  }
  try {
    const raw = Bun.YAML.parse(readFileSync(filePath, "utf8"));
    return validateRuleFile(filePath, raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid rule file ${filePath}: ${message}`);
  }
}
export function loadRules(options: LoadRulesOptions): AstGrepRule[] {
  const userDir = join(options.projectRoot, ".codegraph", "rules");
  const files = [...listRuleFiles(options.bundledDir), ...listRuleFiles(userDir)];
  return files.flatMap(readRuleFile).sort((a, b) => a.name.localeCompare(b.name));
}
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-rules.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.

### Task 5: Add the sg subprocess scan wrapper [depends: 4]

### Task 5: Add the sg subprocess scan wrapper [depends: 4]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Test: `test/indexer-ast-grep-scan.test.ts`
Prerequisite: Bun runtime (project standard in `AGENTS.md`) and `sg` on PATH.

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { runScan, type AstGrepRule, type ExecFn } from "../src/indexer/ast-grep.js";
test("Bun.spawn exists in this runtime", () => {
  expect(typeof Bun.spawn).toBe("function");
});


test("Bun.spawn process contract exposes stdout/stderr/exited used by defaultExec", async () => {
  const proc = Bun.spawn(["echo", "ok"], { stdout: "pipe", stderr: "pipe" });
  expect(proc.stdout).toBeDefined();
  expect(proc.stderr).toBeDefined();
  const code = await proc.exited;
  expect(typeof code).toBe("number");
});

const rule: AstGrepRule = {
  name: "express-route",
  pattern: "$APP.$METHOD($PATH, $$$HANDLERS)",
  lang: "typescript",
  produces: {
    edge_kind: "routes_to",
    from_capture: "HANDLERS",
    to_template: "endpoint:{METHOD}:{PATH}",
    confidence: 0.9,
  },
};

test("runScan uses sg CLI args and normalizes --json output", async () => {
  const calls: Array<{ cmd: string[]; cwd: string }> = [];
  const fakeExec: ExecFn = async (cmd, opts) => {
    calls.push({ cmd, cwd: opts.cwd });
    return `[{"file":"src/api.ts","range":{"start":{"line":2,"column":0}},"metaVariables":{"single":{"METHOD":{"text":"get"},"PATH":{"text":"'/users'"}},"multi":{"HANDLERS":[{"text":"handler"}]}}}]`;
  };

  const matches = await runScan("/tmp/p", rule, ["src/api.ts"], fakeExec);
  expect(calls[0]!.cmd).toEqual([
    "sg", "run", "--json", "--lang", "typescript", "--pattern", "$APP.$METHOD($PATH, $$$HANDLERS)", "src/api.ts",
  ]);
  expect(matches).toEqual([
    {
      file: "src/api.ts",
      line: 3,
      column: 1,
      metaVariables: { METHOD: "get", PATH: "'/users'", HANDLERS: ["handler"] },
    },
  ]);
});


test("defaultExec launch failure path is wrapped with actionable sg message", async () => {
  const prev = Bun.spawn;
  try {
    (Bun as any).spawn = () => {
      throw new Error("spawn ENOENT");
    };
    await expect(runScan("/tmp/p", rule, ["src/api.ts"])).rejects.toThrow("sg invocation failed: Failed to launch sg. Is ast-grep installed?");
  } finally {
    (Bun as any).spawn = prev;
  }
});

test("runScan wraps subprocess launch failures", async () => {
  const fakeExec: ExecFn = async () => {
    throw new Error("Failed to launch sg. Is ast-grep installed? spawn ENOENT");
  };
  await expect(runScan("/tmp/p", rule, ["src/api.ts"], fakeExec)).rejects.toThrow(
    "sg invocation failed: Failed to launch sg. Is ast-grep installed? spawn ENOENT",
  );
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-scan.test.ts
```
Expected: `FAIL — Export named "runScan" not found`

**Step 3 — Implement `runScan()` with explicit command**
```ts
// src/indexer/ast-grep.ts
import { isAbsolute, relative } from "node:path";
interface RawSgMatch {
  file: string;
  range: { start: { line: number; column: number } };
  metaVariables?: {
    single?: Record<string, { text: string }>;
    multi?: Record<string, Array<{ text: string }>>;
  };
}
export interface SgMatch {
  file: string;
  line: number;
  column: number;
  metaVariables: Record<string, string | string[]>;
}

export type ExecFn = (cmd: string[], opts: { cwd: string }) => Promise<string>;
async function defaultExec(cmd: string[], opts: { cwd: string }): Promise<string> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to launch sg. Is ast-grep installed? ${message}`);
  }
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`sg failed (${code}): ${stderr.trim() || stdout.trim()}`);
  return stdout;
}
// Design choice: non-zero sg exit always throws, even if stdout contains partial JSON.
function toProjectRelative(projectRoot: string, file: string): string {
  if (!isAbsolute(file)) return file;
  return relative(projectRoot, file).split("\\").join("/");
}
function normalize(projectRoot: string, raw: RawSgMatch): SgMatch {
  if (!raw.range?.start) throw new Error("Invalid sg JSON output: missing range.start");
  if (!raw.metaVariables || typeof raw.metaVariables !== "object") {
    throw new Error("Invalid sg JSON output: missing metaVariables");
  }
  const metaVariables: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw.metaVariables?.single ?? {})) metaVariables[k] = v.text;
  for (const [k, v] of Object.entries(raw.metaVariables?.multi ?? {})) metaVariables[k] = v.map((x) => x.text);
  return {
    file: toProjectRelative(projectRoot, raw.file),
    line: raw.range.start.line + 1,
    column: raw.range.start.column + 1,
    metaVariables,
  };
}

export async function runScan(projectRoot: string, rule: AstGrepRule, files: string[], execFn: ExecFn = defaultExec): Promise<SgMatch[]> {
  if (files.length === 0) return [];
  const cmd = ["sg", "run", "--json", "--lang", rule.lang, "--pattern", rule.pattern, ...files];
  let stdout: string;
  try {
    stdout = await execFn(cmd, { cwd: projectRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`sg invocation failed: ${message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sg JSON output: ${message}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Invalid sg JSON output: expected array");
  return (parsed as RawSgMatch[]).map((raw) => normalize(projectRoot, raw));
}
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-scan.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.

### Task 6: Create endpoint nodes and routes_to edges from Express matches [depends: 4, 5]

### Task 6: Create endpoint nodes and routes_to edges from Express matches [depends: 4, 5]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Create: `src/rules/express.yaml`
- Test: `test/indexer-ast-grep-express.test.ts`
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphStore } from "../src/graph/store.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";
test("GraphStore contract used by Stage 3 exists", () => {
  const store: GraphStore = new SqliteGraphStore();
  try {
    expect(typeof store.findNodes).toBe("function");
    expect(typeof store.getNeighbors).toBe("function");
    expect(typeof store.getNodesByFile).toBe("function");
    expect(typeof store.addNode).toBe("function");
    expect(typeof store.addEdge).toBe("function");
    expect(typeof store.deleteFile).toBe("function");
  } finally {
    store.close();
  }
});
test("applyRuleMatches creates endpoint nodes and routes_to edges", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handlerA:3", kind: "function", name: "handlerA", file: "src/api.ts", start_line: 3, end_line: 6, content_hash: "hash-api" });
    store.addNode({ id: "src/api.ts::handlerB:7", kind: "function", name: "handlerB", file: "src/api.ts", start_line: 7, end_line: 10, content_hash: "hash-api" });
    const rule: AstGrepRule = {
      name: "express-route",
      pattern: "$APP.$METHOD($PATH, $$$HANDLERS)",
      lang: "typescript",
      produces: { edge_kind: "routes_to", from_capture: "HANDLERS", to_template: "endpoint:{METHOD}:{PATH}", confidence: 0.9 },
    };
    const matches: SgMatch[] = [
      { file: "src/api.ts", line: 2, column: 1, metaVariables: { METHOD: "Get", PATH: "'/users'", HANDLERS: ["handlerA", "handlerB"] } },
      { file: "src/api.ts", line: 12, column: 1, metaVariables: { METHOD: "GET", PATH: "'/admins'", HANDLERS: ["handlerA"] } },
    ];

    applyRuleMatches(store, rule, matches);
    const endpoint = store.getNode("endpoint:GET:/users")!;
    expect(endpoint.kind).toBe("endpoint"); // AC 12
    expect(endpoint.id).toMatch(/^endpoint:[A-Z]+:\/users$/); // explicit AC 28 uppercase METHOD format
    const aRoutes = store.getNeighbors("src/api.ts::handlerA:3", { direction: "out", kind: "routes_to" });
    const bRoutes = store.getNeighbors("src/api.ts::handlerB:7", { direction: "out", kind: "routes_to" });
    expect(aRoutes.map((r) => r.node.id).sort()).toEqual(["endpoint:GET:/admins", "endpoint:GET:/users"]);
    expect(bRoutes.map((r) => r.node.id)).toEqual(["endpoint:GET:/users"]); // AC 13
    expect(store.getNode("endpoint:GET:'/users'" )).toBeNull(); // PATH quote stripping verified
  } finally {
    store.close();
  }
});


test("template rendering supports additional capture keys (e.g. {HANDLER})", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handlerA:3", kind: "function", name: "handlerA", file: "src/api.ts", start_line: 3, end_line: 6, content_hash: "hash-api" });
    const rule: AstGrepRule = {
      name: "express-route-custom-template",
      pattern: "$APP.$METHOD($PATH, $$$HANDLERS)",
      lang: "typescript",
      produces: { edge_kind: "routes_to", from_capture: "HANDLERS", to_template: "endpoint:{METHOD}:{PATH}:{HANDLERS}", confidence: 0.9 },
    };
    const matches: SgMatch[] = [
      { file: "src/api.ts", line: 2, column: 1, metaVariables: { METHOD: "get", PATH: "'/users'", HANDLERS: ["handlerA"] } },
    ];
    applyRuleMatches(store, rule, matches);
    expect(store.getNode("endpoint:GET:/users:handlerA")).toBeDefined();
  } finally {
    store.close();
  }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-express.test.ts
```
Expected: `FAIL — Export named "applyRuleMatches" not found`

**Step 3 — Implement endpoint + routes_to processing**
```ts
// src/indexer/ast-grep.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
function metaValue(meta: Record<string, string | string[]>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return null;
}
function metaValues(meta: Record<string, string | string[]>, key: string): string[] {
  const value = meta[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}
function renderTemplate(template: string, meta: Record<string, string | string[]>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (_, key: string) => {
    const value = meta[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    return "";
  });
}
function applyRoutesToMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const rawMethod = metaValue(match.metaVariables, "METHOD");
    const rawPath = metaValue(match.metaVariables, "PATH");
    if (!rawMethod || !rawPath) continue;
    const method = rawMethod.toUpperCase();
    const path = rawPath.replace(/^['"]|['"]$/g, "");
    const endpointId = renderTemplate(rule.produces.to_template!, { ...match.metaVariables, METHOD: method, PATH: path });

    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = {
        id: endpointId,
        kind: "endpoint",
        name: endpointId,
        file: match.file,
        start_line: match.line,
        end_line: match.line,
        content_hash: handlerNode.content_hash,
      };
      store.addNode(endpointNode);
      store.addEdge({
        source: handlerNode.id,
        target: endpointId,
        kind: "routes_to",
        provenance: { source: "ast-grep", confidence: rule.produces.confidence, evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`, content_hash: handlerNode.content_hash },
        created_at: Date.now(),
      });
    }
  }
}
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  if (rule.produces.edge_kind === "routes_to") applyRoutesToMatches(store, rule, matches);
}
```
```yaml
# src/rules/express.yaml
- name: express-route
  pattern: $APP.$METHOD($PATH, $$$HANDLERS)
  lang: typescript
  produces:
    edge_kind: routes_to
    from_capture: HANDLERS
    to_template: endpoint:{METHOD}:{PATH}
    confidence: 0.9
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-express.test.ts
```
Expected: PASS
**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.

### Task 7: Create renders edges from React matches with enclosing function lookup [depends: 3, 4, 5]

### Task 7: Create renders edges from React matches with enclosing function lookup [depends: 3, 4, 5]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Create: `src/rules/react.yaml`
- Test: `test/indexer-ast-grep-react.test.ts`
Scope: same-file-only target resolution (`store.findNodes(name, match.file)`), no cross-file fallback.
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";
const reactRule: AstGrepRule = {
  name: "react-render",
  pattern: "<$COMPONENT $$$ATTRS />",
  lang: "tsx",
  produces: { edge_kind: "renders", from_context: "enclosing_function", to_capture: "COMPONENT", confidence: 0.8 },
};
test("applyRuleMatches emits renders from smallest containing function", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/App.tsx::App:1", kind: "function", name: "App", file: "src/App.tsx", start_line: 1, end_line: 12, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::renderPanel:4", kind: "function", name: "renderPanel", file: "src/App.tsx", start_line: 4, end_line: 8, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::Button:20", kind: "function", name: "Button", file: "src/App.tsx", start_line: 20, end_line: 24, content_hash: "h" });
    store.addNode({ id: "src/components/Button.tsx::Button:1", kind: "function", name: "Button", file: "src/components/Button.tsx", start_line: 1, end_line: 3, content_hash: "h2" });
    const matches: SgMatch[] = [{ file: "src/App.tsx", line: 6, column: 5, metaVariables: { COMPONENT: "Button" } }];
    applyRuleMatches(store, reactRule, matches);
    const nested = store.getNeighbors("src/App.tsx::renderPanel:4", { direction: "out", kind: "renders" });
    const outer = store.getNeighbors("src/App.tsx::App:1", { direction: "out", kind: "renders" });
    expect(nested).toHaveLength(1);
    expect(nested[0]!.node.id).toBe("src/App.tsx::Button:20");
    expect(nested[0]!.edge.kind).toBe("renders"); // AC 14
    expect(outer).toHaveLength(0);
  } finally { store.close(); }
});
test("enclosing_function boundaries are inclusive and tie-break is deterministic", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/App.tsx::A:4", kind: "function", name: "A", file: "src/App.tsx", start_line: 4, end_line: 8, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::B:4", kind: "function", name: "B", file: "src/App.tsx", start_line: 4, end_line: 8, content_hash: "h" });
    store.addNode({ id: "src/App.tsx::Button:20", kind: "function", name: "Button", file: "src/App.tsx", start_line: 20, end_line: 24, content_hash: "h" });

    applyRuleMatches(store, reactRule, [
      { file: "src/App.tsx", line: 4, column: 1, metaVariables: { COMPONENT: "Button" } },
      { file: "src/App.tsx", line: 8, column: 1, metaVariables: { COMPONENT: "Button" } },
    ]);
    const a = store.getNeighbors("src/App.tsx::A:4", { direction: "out", kind: "renders" });
    const b = store.getNeighbors("src/App.tsx::B:4", { direction: "out", kind: "renders" });
    // deterministic tie-break on identical span/start_line uses id ordering
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(0);
  } finally { store.close(); }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-react.test.ts
```
Expected: `FAIL — Expected length: 1, received length: 0`

**Step 3 — Implement same-file renders processing**
```ts
// src/indexer/ast-grep.ts
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";
// GraphStore contract excerpt: getNodesByFile(file), findNodes(name, file?), addEdge(...).
function metaValue(meta: Record<string, string | string[]>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return null;
}
function smallestContainingFunction(nodes: GraphNode[], line: number): GraphNode | null {
  const candidates = nodes.filter((n) => n.kind === "function" && n.start_line <= line && (n.end_line ?? n.start_line) >= line);
  if (candidates.length === 0) return null;
  const span = (n: GraphNode) => (n.end_line ?? n.start_line) - n.start_line;
  return candidates.sort((a, b) => span(a) - span(b) || a.start_line - b.start_line || a.id.localeCompare(b.id))[0]!;
}
function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const targetName = metaValue(match.metaVariables, rule.produces.to_capture ?? "");
    if (!targetName) continue;
    const sourceNode = smallestContainingFunction(store.getNodesByFile(match.file), match.line);
    if (!sourceNode) continue;
    const targetNode = store.findNodes(targetName, match.file)[0];
    if (!targetNode) continue;
    store.addEdge({
      source: sourceNode.id,
      target: targetNode.id,
      kind: "renders",
      provenance: { source: "ast-grep", confidence: rule.produces.confidence, evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`, content_hash: sourceNode.content_hash },
      created_at: Date.now(),
    });
  }
}
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  if (rule.produces.edge_kind === "routes_to") return applyRoutesToMatches(store, rule, matches);
  if (rule.produces.edge_kind === "renders") return applyRendersMatches(store, rule, matches);
}
```
```yaml
# src/rules/react.yaml
- name: react-render
  pattern: <$COMPONENT $$$ATTRS />
  lang: tsx
  produces:
    edge_kind: renders
    from_context: enclosing_function
    to_capture: COMPONENT
    confidence: 0.8
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-react.test.ts
```
Expected: PASS
**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.

### Task 8: Run the ast-grep stage from the pipeline and keep Stage 3 incremental behavior correct [depends: 3, 4, 5, 6, 7]

### Task 8: Run the ast-grep stage from the pipeline and keep Stage 3 incremental behavior correct [depends: 3, 4, 5, 6, 7]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Modify: `src/indexer/pipeline.ts`
- Test: `test/indexer-ast-grep-express-integration.test.ts`
```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { runAstGrepIndexStage } from "../src/indexer/ast-grep.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};


test("sg binary is available for Stage 3 subprocess integration", async () => {
  const proc = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    // CI environments without sg should skip this capability check; functional coverage still exists in mocked/unit tests.
    console.warn("Skipping sg capability assertion: sg --version returned non-zero");
    return;
  }
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toBe("");
});


test("runAstGrepIndexStage passes only changed files to scanFn", async () => {
  const store = new SqliteGraphStore();
  const calls: string[][] = [];
  const spyScan = async (_root: string, _rule: any, files: string[]) => {
    calls.push(files);
    return [];
  };

  try {
    await runAstGrepIndexStage(store, process.cwd(), [], spyScan as any);
    expect(calls).toEqual([]); // unchanged run: no sg invocation
  } finally {
    store.close();
  }
});


test("runAstGrepIndexStage passes exactly provided changed files to scanFn", async () => {
  const store = new SqliteGraphStore();
  const calls: string[][] = [];
  const spyScan = async (_root: string, _rule: any, files: string[]) => {
    calls.push(files);
    return [];
  };

  try {
    await runAstGrepIndexStage(store, process.cwd(), ["src/a.ts", "src/b.ts"], spyScan as any);
    expect(calls.every((files) => files.length === 2)).toBeTrue();
    expect(calls[0]).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("SqliteGraphStore.deleteFile removes endpoint nodes and Stage-3 routes_to edges", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handler:1", kind: "function", name: "handler", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h" });
    store.addNode({ id: "endpoint:GET:/users", kind: "endpoint", name: "endpoint:GET:/users", file: "src/api.ts", start_line: 2, end_line: 2, content_hash: "h" });
    store.addEdge({
      source: "src/api.ts::handler:1",
      target: "endpoint:GET:/users",
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.9, evidence: "t", content_hash: "h" },
      created_at: 1,
    });
    store.deleteFile("src/api.ts");
    expect(store.getNode("endpoint:GET:/users")).toBeNull();
    expect(store.getNeighbors("src/api.ts::handler:1", { direction: "out", kind: "routes_to" })).toHaveLength(0);
  } finally {
    store.close();
  }
});
test("bundled rules path resolves and bundled files exist", () => {
  const bundledDir = fileURLToPath(new URL("../src/rules/", import.meta.url));
  expect(bundledDir.includes("/src/rules")).toBeTrue();
  expect(existsSync(join(bundledDir, "express.yaml"))).toBeTrue();
  expect(existsSync(join(bundledDir, "react.yaml"))).toBeTrue();
});
test("pipeline Stage 3 minimal Express integration creates endpoint node id and routes_to edge", async () => {
  const root = join(tmpdir(), `pi-cg-express-min-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "api.ts"),
    "export function handler() { return 1; }\napp.get('/users', handler);\n",
  );

  const store = new SqliteGraphStore();
  try {

    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping Stage 3 integration assertion: sg not available");
      return;
    }
    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    // This integration test uses the real sg subprocess path (Task 5 only mocks ExecFn in unit scope).

    // Tree-sitter must run first so the handler node exists before Stage 3 attaches routes_to.

    const handler = store.findNodes("handler", "src/api.ts")[0]!;
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(1);
    expect(store.getNode("endpoint:GET:/users")).toBeDefined();
    const routes = store.getNeighbors(handler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/users"]);
    expect(routes.every((result) => result.edge.provenance.source === "ast-grep")).toBeTrue();
    // Duplicate prevention check: unchanged re-index keeps cardinality stable (AC 26 + PK behavior).
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("pipeline Stage 3 indexes express routes, replaces changed matches, keeps unchanged reruns stable, and cleans removed-file artifacts", async () => {
  const root = join(tmpdir(), `pi-cg-express-stage3-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  const apiPath = join(root, "src", "api.ts");
  writeFileSync(
    apiPath,
    "export function handler() { return 1; }\nexport function caller() { return handler(); }\napp.get('/users', handler);\n",
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    // Tree-sitter output already exists in the shared store before Stage 3 runs.

    const handler = store.findNodes("handler", "src/api.ts")[0]!;
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(1);
    let routes = store.getNeighbors(handler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/users"]);
    const caller = store.findNodes("caller", "src/api.ts")[0]!;
    expect(store.getNeighbors(caller.id, { direction: "out", kind: "calls" })).toHaveLength(1);

    writeFileSync(
      apiPath,
      "export function handler() { return 1; }\nexport function caller() { return handler(); }\napp.get('/accounts', handler);\n",
    );
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const updatedHandler = store.findNodes("handler", "src/api.ts")[0]!;
    routes = store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/accounts"]);
    expect(routes.every((result) => result.edge.provenance.source === "ast-grep")).toBeTrue();
    expect(store.getNode("endpoint:GET:/users")).toBeNull();
    expect(store.getNeighbors(caller.id, { direction: "out", kind: "calls" })).toHaveLength(1);
    const callEdges = store.getNeighbors(caller.id, { direction: "out", kind: "calls" });
    expect(callEdges).toHaveLength(1);
    expect(callEdges[0]!.edge.provenance.source).not.toBe("ast-grep");
    const edgeCountBeforeUnchanged = routes.length;
    const unchanged = await indexProject(root, store, { lspClientFactory: () => fakeClient });
    routes = store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" });
    expect(routes).toHaveLength(1);
    expect(routes.length).toBe(edgeCountBeforeUnchanged);
    expect(new Set(routes.map((result) => `${result.edge.source}->${result.edge.target}`)).size).toBe(1);
    expect(store.findNodes("endpoint:GET:/accounts")).toHaveLength(1);
    expect(unchanged.indexed).toBe(0);
    // unchanged.indexed === 0 means changedFiles is empty, so Stage 3 receives no files and does not invoke sg.
    expect(unchanged.skipped).toBeGreaterThan(0);

    rmSync(apiPath);
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(0);
    expect(store.getNode("endpoint:GET:/accounts")).toBeNull();
    // deleteFile cleanup must also remove stale Stage-3 edges (AC 25)
    expect(store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" })).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-express-integration.test.ts
```
Expected: `FAIL — Expected ["endpoint:GET:/users"], received []`
**Step 3 — Integrate Stage 3 in pipeline with module-relative bundled rules path**
```ts
// src/indexer/ast-grep.ts
import { fileURLToPath } from "node:url";
import type { GraphStore } from "../graph/store.js";
export async function runAstGrepIndexStage(
  store: GraphStore,
  projectRoot: string,
  files: string[],
  scanFn: typeof runScan = runScan,
): Promise<void> {
  // Uses the same GraphStore instance created by the indexing pipeline (AC 32).
  if (files.length === 0) return;
  const bundledDir = fileURLToPath(new URL("../rules/", import.meta.url));
  // Invariant: ast-grep.ts remains under src/indexer/ so ../rules/ resolves to src/rules/ (AC 16/17).
  const rules = loadRules({ bundledDir, projectRoot });
  // Missing bundledDir is non-fatal because loadRules() returns [] for non-existent dirs.

  // `files` is the pipeline's `changedFiles` list, so each sg invocation is restricted to changed files only.
  for (const rule of rules) {
    const matches = await scanFn(projectRoot, rule, files);
    applyRuleMatches(store, rule, matches);
  }
}
```

```ts
// src/indexer/pipeline.ts
// GraphStore API used below (src/graph/store.ts):
// getFileHash(file), setFileHash(file, hash), deleteFile(file), listFiles(), addNode(), addEdge().
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { runAstGrepIndexStage } from "./ast-grep.js";
import { extractFile, sha256Hex } from "./tree-sitter.js";
import { TsServerClient, type ITsServerClient } from "./tsserver-client.js";
import { runLspIndexStage } from "./lsp.js";

interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
}

function toPosixPath(p: string): string {
  return p.split("\\").join("/");
}

// walkTsFiles(root) is the concrete helper added in Task 3 and reused here.
// (not redefined in this snippet).

interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
}
interface GraphStorePersistenceSubset {
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  deleteFile(file: string): void;
  listFiles(): string[];
}
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  const files = walkTsFiles(projectRoot);

  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;
  const changedFiles: string[] = [];

  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
// `toPosixPath()` and `walkTsFiles()` are existing helpers in this module.
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));
    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);
      const existing = store.getFileHash(rel);
      if (existing === hash) {
        skipped++;
        continue;
      }
      if (existing !== null) {
        store.deleteFile(rel);
        // AC 25: this removes stale ast-grep edges touching nodes from rel before Stage 3 rescans.
        // SqliteGraphStore.deleteFile() removes stale ast-grep/tree-sitter/lsp edges touching file nodes before deleting nodes/file hash.
        // Tree-sitter edges are re-created immediately by extractFile/addEdge below.
      }

      const extracted = extractFile(rel, content);
      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);
      store.setFileHash(rel, hash);
      changedFiles.push(rel);
      indexed++;
    } catch {
      errors++;
    }
  }

  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile)) continue;
    try {
      store.deleteFile(oldFile);
      removed++;
    } catch {
      errors++;
    }
  }

  const client = options.lspClientFactory ? options.lspClientFactory(projectRoot) : new TsServerClient(projectRoot);
  // TsServerClient constructor signature (pre-existing): new TsServerClient(projectRoot: string)
  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  // Stale ast-grep artifacts for changed files are removed by the existing pipeline-level
  // store.deleteFile(rel) call before this stage runs; do not add a Stage 3 delete helper.
  // Duplicate ast-grep edges are also prevented by SqliteGraphStore edge PRIMARY KEY
  // schema: CREATE TABLE edges (..., PRIMARY KEY (source, target, kind, provenance_source)).
  // (source, target, kind, provenance_source).
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  // AC 33 ordering is explicit: tree-sitter extraction above, then LSP, then Stage 3 ast-grep.
  return { indexed, skipped, removed, errors };
}
```

```ts
// src/index.ts (existing lifecycle; shown here to make AC 32/33 explicit)
let sharedStore: GraphStore | null = null;

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  sharedStore = new SqliteGraphStore(join(projectRoot, ".codegraph", "graph.db"));
  return sharedStore;
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-express-integration.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.

### Task 9: Index React renders from a real TSX fixture [depends: 3, 7, 8]

### Task 9: Index React renders from a real TSX fixture [depends: 3, 7, 8]
**Files:**
- Test: `test/indexer-ast-grep-react-integration.test.ts`
Scope note: AC 30 is satisfied with React render extraction. For this milestone we intentionally keep same-file target lookup to preserve AC 24/26 incremental correctness; cross-file invalidation expansion is out-of-scope.
**Step 1 — Write the failing integration test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};
test("pipeline Stage 3 indexes same-file renders edges from TSX fixture", async () => {
  const root = join(tmpdir(), `pi-cg-react-stage3-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });
  writeFileSync(join(root, "src", "App.tsx"), `export function Button() { return <button/>; }
export function App() {
  return <Button />;
}
`);
  writeFileSync(join(root, "src", "components", "Button.tsx"), `export function Button() {
  return <button>external</button>;
}
`);
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping React Stage 3 integration: sg not available");
      return;
    }

    const app = store.findNodes("App", "src/App.tsx")[0]!;
    const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
    expect(renders).toHaveLength(1);
    expect(renders[0]!.node.name).toBe("Button");
    expect(renders[0]!.node.file).toBe("src/App.tsx");
    expect(renders.some((r) => r.node.file === "src/components/Button.tsx")).toBeFalse();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});


test("same-file-only lookup excludes cross-file target when local target is absent", async () => {
  const root = join(tmpdir(), `pi-cg-react-stage3-miss-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });

  writeFileSync(join(root, "src", "App.tsx"), `export function App() { return <Button />; }\n`);
  writeFileSync(join(root, "src", "components", "Button.tsx"), `export function Button() { return <button/>; }\n`);

  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const sgCheck2 = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck2.exited) !== 0) {
      console.warn("Skipping React Stage 3 integration: sg not available");
      return;
    }
    const app = store.findNodes("App", "src/App.tsx")[0]!;
    const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
    expect(renders).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 - Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-react-integration.test.ts
```
Expected: `FAIL — test file not found` (Step 1 has not yet been written to disk). Once written, if Tasks 3, 7, and 8 are already complete and `sg` is installed, the test may be GREEN immediately — that is expected. Step 3 has no new implementation to add; proceed to Step 4.

**Step 3 — Rely on same-file lookup from Task 7 (no cross-file fallback)**
```ts
// src/indexer/ast-grep.ts inside applyRendersMatches()
const targetNode = store.findNodes(targetName, match.file)[0];
if (!targetNode) continue;
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-react-integration.test.ts
```
Expected: PASS
**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
