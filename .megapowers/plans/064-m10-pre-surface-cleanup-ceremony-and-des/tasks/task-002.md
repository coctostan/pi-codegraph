---
id: 2
title: Apply fresh-trust suppression to read-only extension outputs
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-readonly-trust-gating.test.ts
---

### Task 2: Apply fresh-trust suppression to read-only extension outputs [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-readonly-trust-gating.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-readonly-trust-gating.test.ts` with this exact content:

```ts
import { test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";

function registerTools() {
  const tools: Array<{ name: string; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; execute: Function }) {
      tools.push(tool);
    },
    on() {},
  };

  resetStoreForTesting();
  piCodegraph(mockPi as any);
  return tools;
}

function createFreshProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-trust-gating-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return projectRoot;
}

function populateStore(projectRoot: string, content: string): string {
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const store = new SqliteGraphStore(dbPath);
  const extracted = extractFile("src/app.ts", content);
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);
  store.setFileHash("src/app.ts", sha256Hex(content));
  store.close();
  return dbPath;
}

test("fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines", async () => {
  const projectRoot = createFreshProject();
  const tools = registerTools();
  const symbolGraphTool = tools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraphTool) throw new Error("symbol_graph tool was not registered");

  try {
    const result = await symbolGraphTool.execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (text.includes("## Trust")) {
      throw new Error("fresh read-only output still rendered the Trust header");
    }
    if (!text.startsWith("## foo (function)")) {
      throw new Error(`fresh read-only output lost the symbol_graph body: ${text}`);
    }
    if (!text.includes("tree-sitter")) {
      throw new Error("fresh read-only output lost edge provenance");
    }
    if (!text.includes("[leaf, untested]")) {
      throw new Error("fresh read-only output lost signal tags");
    }
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("non-fresh trace tool calls still render the Trust header", async () => {
  const projectRoot = createFreshProject();
  const tools = registerTools();
  const traceTool = tools.find((tool) => tool.name === "trace");
  if (!traceTool) throw new Error("trace tool was not registered");

  try {
    const result = await traceTool.execute(
      "call-2",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.startsWith("## Trust\nstatus: heuristic")) {
      throw new Error(`non-fresh trace output lost the Trust header: ${text}`);
    }
    if (!text.includes("mode: static (heuristic, no runtime evidence)")) {
      throw new Error("non-fresh trace output lost the trace body");
    }
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readonly reindex output still renders the indexing-failed note", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-trust-readonly-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const original = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);
  const dbPath = populateStore(projectRoot, original);
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function foo() { return 2; }\n");
  chmodSync(dbPath, 0o444);

  const tools = registerTools();
  const graphQueryTool = tools.find((tool) => tool.name === "graph_query");
  if (!graphQueryTool) throw new Error("graph_query tool was not registered");

  try {
    const result = await graphQueryTool.execute(
      "call-3",
      { query: 'MATCH (n {name: "foo"}) RETURN n' },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;

    if (!text.includes("indexing-failed: graph may be stale (readonly database)")) {
      throw new Error("readonly reindex output lost the indexing-failed note");
    }
    if (!text.includes("foo")) {
      throw new Error("readonly reindex output lost graph_query results");
    }
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-readonly-trust-gating.test.ts`
Expected: FAIL — `Error: fresh read-only output still rendered the Trust header`

**Step 3 — Write minimal implementation**
In `src/index.ts`, make these exact changes.

1. Add the new import near the other output/tool imports:

```ts
import { suppressFreshTrustHeader } from "./output/read-only-ceremony.js";
```

2. Add this helper immediately after `indexingFailedNote()`:

```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  return appendTokenMeta(toolName, params, withIndexingNote, store, projectRoot);
}
```

3. Replace each read-only tool tail with the centralized helper call:

```ts
// symbol_graph
const text = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
const output = finalizeReadOnlyOutput("symbol_graph", { name: params.name, file: params.file }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// impact
const text = impact({
  symbols: params.symbols,
  changeType: params.changeType,
  store,
  projectRoot,
  maxDepth: params.maxDepth,
});
const output = finalizeReadOnlyOutput("impact", { symbols: params.symbols }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// trace
const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
const output = finalizeReadOnlyOutput("trace", { entry: params.entry, file: params.file }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// graph_query
const text = graphQuery({ query: params.query, store, projectRoot });
const output = finalizeReadOnlyOutput("graph_query", {}, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// symbol_card
const text = symbolCard({ name: params.name, file: params.file, maxSourceLines: params.maxSourceLines, store, projectRoot });
const output = finalizeReadOnlyOutput("symbol_card", { name: params.name, file: params.file }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// symbol_contract
const text = symbolContract({ name: params.name, file: params.file, store, projectRoot });
const output = finalizeReadOnlyOutput("symbol_contract", { name: params.name, file: params.file }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// graph_overview
const text = graphOverview({ store, projectRoot });
const output = finalizeReadOnlyOutput("graph_overview", {}, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// dead_code
const text = deadCode({ name: params.name, file: params.file, kind: params.kind, glob: params.glob, store, projectRoot });
const output = finalizeReadOnlyOutput("dead_code", { name: params.name }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };

// symbol_search
const text = symbolSearch({
  query: params.query,
  kind: params.kind as any,
  file: params.file,
  limit: params.limit,
  store,
  projectRoot,
});
const output = finalizeReadOnlyOutput("symbol_search", { query: params.query }, text, store, projectRoot);
return { content: [{ type: "text", text: output }], details: undefined };
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-readonly-trust-gating.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing
