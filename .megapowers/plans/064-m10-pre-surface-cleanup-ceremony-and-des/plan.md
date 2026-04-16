# Plan

### Task 1: Add fresh-trust suppression helper

### Task 1: Add fresh-trust suppression helper

**Files:**
- Create: `src/output/read-only-ceremony.ts`
- Test: `test/output-readonly-ceremony.test.ts`

**Step 1 — Write the failing test**
Create `test/output-readonly-ceremony.test.ts` with this exact content:

```ts
import { test } from "bun:test";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";

test("suppressFreshTrustHeader strips only fresh trust headers", () => {
  const fresh = [
    "## Trust",
    "status: fresh",
    "evidence: none  stale-files: 0/0",
    "rows: 1",
    "",
  ].join("\n");

  const freshResult = suppressFreshTrustHeader(fresh);
  if (freshResult !== "rows: 1\n") {
    throw new Error(`fresh trust header was not removed: ${JSON.stringify(freshResult)}`);
  }

  for (const status of ["stale", "mixed", "heuristic", "runtime-backed"] as const) {
    const nonFresh = [
      "## Trust",
      `status: ${status}`,
      "evidence: tree-sitter  stale-files: 1/2",
      "rows: 1",
      "",
    ].join("\n");

    const result = suppressFreshTrustHeader(nonFresh);
    if (result !== nonFresh) {
      throw new Error(`non-fresh trust header was modified: ${status}`);
    }
  }

  const bodyOnly = "rows: 1\n";
  const bodyOnlyResult = suppressFreshTrustHeader(bodyOnly);
  if (bodyOnlyResult !== bodyOnly) {
    throw new Error("body without trust header was modified");
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-readonly-ceremony.test.ts`
Expected: FAIL — `Cannot find module "../src/output/read-only-ceremony.js" from "test/output-readonly-ceremony.test.ts"`

**Step 3 — Write minimal implementation**
Create `src/output/read-only-ceremony.ts` with this exact content:

```ts
export function suppressFreshTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (lines[1] !== "status: fresh") return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-readonly-ceremony.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing

### Task 2: Apply fresh-trust suppression to read-only extension outputs [depends: 1]

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

### Task 3: Gate `_meta` on `CODEGRAPH_DEVMETA` [depends: 2]

### Task 3: Gate `_meta` on `CODEGRAPH_DEVMETA` [depends: 2]

**Files:**
- Modify: `src/tools/token-tracker.ts`
- Modify: `src/index.ts`
- Test: `test/extension-readonly-devmeta.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-readonly-devmeta.test.ts` with this exact content:

```ts
import { test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

function createProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-devmeta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return projectRoot;
}

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

test("CODEGRAPH_DEVMETA gates _meta per call without restart", async () => {
  const projectRoot = createProject();
  const previous = process.env.CODEGRAPH_DEVMETA;
  const tools = registerTools();
  const symbolGraphTool = tools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraphTool) throw new Error("symbol_graph tool was not registered");

  try {
    delete process.env.CODEGRAPH_DEVMETA;
    const offResult = await symbolGraphTool.execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const offText = (offResult.content[0] as any).text as string;
    if (offText.includes("_meta:")) {
      throw new Error("read-only output rendered _meta without CODEGRAPH_DEVMETA");
    }

    process.env.CODEGRAPH_DEVMETA = "1";
    const onResult = await symbolGraphTool.execute(
      "call-2",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const onText = (onResult.content[0] as any).text as string;
    if (!onText.includes("_meta:")) {
      throw new Error("read-only output did not render _meta when CODEGRAPH_DEVMETA=1");
    }

    delete process.env.CODEGRAPH_DEVMETA;
    const toggledOffResult = await symbolGraphTool.execute(
      "call-3",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const toggledOffText = (toggledOffResult.content[0] as any).text as string;
    if (toggledOffText.includes("_meta:")) {
      throw new Error("read-only output cached CODEGRAPH_DEVMETA across calls");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMETA;
    else process.env.CODEGRAPH_DEVMETA = previous;
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-readonly-devmeta.test.ts`
Expected: FAIL — `Error: read-only output rendered _meta without CODEGRAPH_DEVMETA`

**Step 3 — Write minimal implementation**
In `src/tools/token-tracker.ts`, add the per-call env helper and the gated wrapper exactly like this:

```ts
export function devMetaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.CODEGRAPH_DEVMETA?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function appendTokenMetaIfEnabled(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  if (!devMetaEnabled()) return toolOutput;
  return appendTokenMeta(toolName, params, toolOutput, store, projectRoot);
}
```

Then update the import and centralized helper in `src/index.ts`:

```ts
import { appendTokenMetaIfEnabled, resetSession } from "./tools/token-tracker.js";
```

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
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-readonly-devmeta.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing

### Task 4: Normalize the `trace` description [depends: 3]

### Task 4: Normalize the `trace` description [depends: 3]

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-trace-description.test.ts`

**Step 1 — Write the failing test**
Replace `test/extension-trace-description.test.ts` with this exact content:

```ts
import { test } from "bun:test";

test("pi extension registers trace with the approved description", async () => {
  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((tool) => tool.name === "trace");
  if (!traceTool) {
    throw new Error("trace tool was not registered");
  }

  const expected = "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.";
  if (traceTool.description !== expected) {
    throw new Error(`trace description mismatch: ${traceTool.description}`);
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-trace-description.test.ts`
Expected: FAIL — `Error: trace description mismatch: Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `trace` description with this exact string:

```ts
description:
  "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-trace-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing

### Task 5: Normalize the `graph_query` description [depends: 4]

### Task 5: Normalize the `graph_query` description [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Test: `test/extension-graph-query-description.test.ts`

**Step 1 — Write the failing test**
Replace `test/extension-graph-query-description.test.ts` with this exact content:

```ts
import { test } from "bun:test";

test("pi extension registers graph_query with the approved description", async () => {
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  mod.default(mockPi as any);

  const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
  if (!tool) {
    throw new Error("graph_query tool was not registered");
  }

  const expected = "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.";
  if (tool.description !== expected) {
    throw new Error(`graph_query description mismatch: ${tool.description}`);
  }
  if (tool.description.includes('MATCH (a {name: "hello"}) RETURN a')) {
    throw new Error("graph_query description still includes inline examples");
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: FAIL — `Error: graph_query description mismatch: Execute a Cypher subset query against the graph.`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `graph_query` description block with this exact string:

```ts
description:
  "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.",
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing

### Task 6: Normalize the remaining tool descriptions [depends: 5]

### Task 6: Normalize the remaining tool descriptions [depends: 5]

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-symbol-search.test.ts`
- Test: `test/extension-tool-descriptions.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-tool-descriptions.test.ts` with this exact content:

```ts
import { test } from "bun:test";

test("pi extension registers the approved descriptions for all 11 tools", async () => {
  const expected = new Map<string, string>([
    ["symbol_graph", "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol."],
    ["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."],
    ["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."],
    ["impact", "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code."],
    ["trace", "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs."],
    ["graph_query", "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query."],
    ["symbol_card", "Return a compact symbol summary with definition, signature, tests, relationships, and signals."],
    ["symbol_contract", "Return a symbol's behavioral contract from code and tests.\nWhen to use: You need inputs, outputs, throws, or asserted behavior."],
    ["graph_overview", "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points."],
    ["dead_code", "Find unreferenced exported symbols or check whether a symbol is still referenced.\nWhen to use: You are looking for cleanup candidates."],
    ["symbol_search", "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file."],
  ]);

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default(mockPi as any);

  const names = registeredTools.map((tool) => tool.name).sort();
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`registered tool list mismatch: ${names.join(",")}`);
  }

  for (const tool of registeredTools) {
    if (!tool.description.trim()) {
      throw new Error(`empty description for ${tool.name}`);
    }
    const wanted = expected.get(tool.name);
    if (!wanted) {
      throw new Error(`unexpected tool registered: ${tool.name}`);
    }
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
});
```

Replace the first test in `test/extension-symbol-search.test.ts` with this exact content, leaving the execution test unchanged:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { resetSearchCacheForTesting } from "../src/tools/symbol-search.js";

test("symbol_search tool is registered in the extension with the approved description", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  const searchTool = tools.find((t) => t.name === "symbol_search");
  if (!searchTool) {
    throw new Error("symbol_search tool was not registered");
  }

  const expected = "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file.";
  if (searchTool.description !== expected) {
    throw new Error(`symbol_search description mismatch: ${searchTool.description}`);
  }
});

test("symbol_search tool executes and returns results", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-search-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function helloWorld() { return 1; }\n");

  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  const searchTool = tools.find((t) => t.name === "symbol_search")!;

  try {
    const result = await searchTool.execute("call-1", { query: "hello world" }, undefined as any, () => {}, { cwd: projectRoot } as any);
    const text = (result.content[0] as any).text as string;
    expect(text).toContain("helloWorld");
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-tool-descriptions.test.ts test/extension-symbol-search.test.ts`
Expected: FAIL — `Error: description mismatch for symbol_graph: Look up a symbol and return its anchored neighborhood`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the remaining description strings with these exact values:

```ts
// symbol_graph
description:
  "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol.",

// resolve_edge
description:
  "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs.",

// delete_edge
description:
  "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete.",

// impact
description:
  "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",

// symbol_card
description:
  "Return a compact symbol summary with definition, signature, tests, relationships, and signals.",

// symbol_contract
description:
  "Return a symbol's behavioral contract from code and tests.\nWhen to use: You need inputs, outputs, throws, or asserted behavior.",

// graph_overview
description:
  "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points.",

// dead_code
description:
  "Find unreferenced exported symbols or check whether a symbol is still referenced.\nWhen to use: You are looking for cleanup candidates.",

// symbol_search
description:
  "Find symbols by approximate name match.\nWhen to use: You know roughly what a symbol is called but not its exact name or file.",
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-tool-descriptions.test.ts test/extension-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing

### Task 7: Document the normalized tool surface [no-test] [depends: 6]

### Task 7: Document the normalized tool surface [depends: 6] [no-test]

**Justification:** Documentation-only changes: add the style guide, update README/ARCHITECTURE inventories, and reconcile tool-surface docs to the 11 registered tools. No runtime behavior changes.

**Files:**
- Create: `docs/tool-descriptions.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Step 1 — Make the change**
1. Create `docs/tool-descriptions.md` with this exact content:

```md
# Tool Description Style Guide

Tool descriptions exist to help the model decide whether to call a tool. Keep them short, action-oriented, and focused on the decision to reach for the tool.

## Rules
1. Start with one terse action-oriented line that says what the tool does or returns.
2. Add a `When to use:` block only when the trigger is not obvious from the first line.
3. Keep `When to use:` to 1-2 short lines.
4. Do not include inline examples in top-level tool descriptions.
5. Do not cross-reference other tool names from a description.
6. Do not restate parameters that the TypeBox schema already documents.

## Good
- `Return a symbol's callers, callees, tests, and key signals.`
  `When to use: You need structural context for a named symbol.`
- `Run a Cypher subset query against the graph.`
  `When to use: You need an ad hoc graph slice that is easier to express as a query.`

## Bad
- `Execute a Cypher subset query against the graph. Examples: MATCH ...`
- `Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.`
- `Find symbols by approximate name. Parameters: query, kind, file, limit.`

## Maintenance
`src/index.ts` is the source of truth for registered tools. When the tool surface changes, update this guide, `README.md`, and `ARCHITECTURE.md` together.
```

2. In `README.md`:
- Change the install paragraph so it says the extension exposes **11 tools**, not 8.
- Replace the `## Tools` section so it contains exactly these subsections, in registered order: `symbol_graph`, `resolve_edge`, `delete_edge`, `impact`, `trace`, `graph_query`, `symbol_card`, `symbol_contract`, `graph_overview`, `dead_code`, `symbol_search`.
- Use the approved first-line description text from `src/index.ts` for each subsection.
- Keep examples in README only; add short example blocks for the three missing sections:
  - `graph_overview({})`
  - `dead_code({})`
  - `symbol_search({ query: "validate token" })`

3. In `ARCHITECTURE.md`:
- Update the top `Tools:` line in the system overview diagram so it lists all 11 registered tools.
- Add this one-line pointer under `## Output Layer`:
  - `Tool description authoring rules live in docs/tool-descriptions.md.`
- Update the file-layout section so it lists the current tool files, including `delete-edge.ts`, `symbol-card.ts`, `symbol-contract.ts`, `graph-overview.ts`, `dead-code.ts`, and `symbol-search.ts`.
- Ensure any stale text that still implies an 8-tool or 5-tool surface is rewritten to match `src/index.ts`.

**Step 2 — Verify**
Run: `bun -e 'import { readFileSync } from "node:fs"; const read = (path) => readFileSync(path, "utf8"); const tools = ["symbol_graph", "resolve_edge", "delete_edge", "impact", "trace", "graph_query", "symbol_card", "symbol_contract", "graph_overview", "dead_code", "symbol_search"]; const readme = read("README.md"); const architecture = read("ARCHITECTURE.md"); const guide = read("docs/tool-descriptions.md"); for (const tool of tools) { if (!readme.includes(`### \`${tool}\``)) throw new Error(`README.md missing ${tool}`); if (!architecture.includes(tool)) throw new Error(`ARCHITECTURE.md missing ${tool}`); } if (!architecture.includes("docs/tool-descriptions.md")) throw new Error("ARCHITECTURE.md missing tool description guide pointer"); if (!guide.includes("When to use:")) throw new Error("docs/tool-descriptions.md missing style-guide rule text");' && bun test && bun run check`
Expected: success — docs contain the full 11-tool inventory, the style guide exists, the architecture doc points to it, and the test/typecheck suite stays green
