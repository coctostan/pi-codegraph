# Plan

### Task 1: Add CODEGRAPH_DEVMODE parser helper

### Task 1: Add CODEGRAPH_DEVMODE parser helper

**Files:**
- Create: `src/config/dev-mode.ts`
- Test: `test/dev-mode.test.ts`

**Step 1 — Write the failing test**
Create `test/dev-mode.test.ts`:

```ts
import { test } from "bun:test";
import { devModeEnabled } from "../src/config/dev-mode.js";

test("devModeEnabled accepts the approved truthy values and rejects disabled values", () => {
  const truthy = ["1", "true", "TRUE", "yes", "YES", "on", "On"];
  for (const value of truthy) {
    if (!devModeEnabled({ CODEGRAPH_DEVMODE: value })) {
      throw new Error(`devModeEnabled rejected truthy value: ${value}`);
    }
  }

  const disabled = [undefined, "", "0", "false", "FALSE"];
  for (const value of disabled) {
    if (devModeEnabled({ CODEGRAPH_DEVMODE: value })) {
      throw new Error(`devModeEnabled accepted disabled value: ${String(value)}`);
    }
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/dev-mode.test.ts`
Expected: FAIL — `Cannot find module '../src/config/dev-mode.js' from 'test/dev-mode.test.ts'`

**Step 3 — Write minimal implementation**
Create `src/config/dev-mode.ts`:

```ts
export function devModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.CODEGRAPH_DEVMODE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/dev-mode.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Demote symbol_search from the registered extension surface [depends: 1]

### Task 2: Demote symbol_search from the registered extension surface [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-symbol-search.test.ts`
- Modify: `test/extension-tool-descriptions.test.ts`

**Step 1 — Write the failing test**
Replace `test/extension-symbol-search.test.ts` with:

```ts
import { expect, test } from "bun:test";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";

test("symbol_search is no longer registered in the extension surface", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  if (tools.some((tool) => tool.name === "symbol_search")) {
    throw new Error("symbol_search was still registered in the extension surface");
  }
});

test("symbolSearch remains exported for internal callers", () => {
  const store = new SqliteGraphStore();

  try {
    store.addNode({
      id: "src/hello.ts::helloWorld:1",
      kind: "function",
      name: "helloWorld",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "hash-1",
      is_exported: true,
      signature: "() => number",
    });

    const text = symbolSearch({
      query: "hello world",
      store,
      projectRoot: ".",
    });

    expect(text).toContain("helloWorld");
    expect(text).toContain("src/hello.ts:1");
  } finally {
    resetSearchCacheForTesting();
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: FAIL — `Error: symbol_search was still registered in the extension surface`

**Step 3 — Write minimal implementation**
In `src/index.ts`:

1. Narrow the symbol-search import so `resetStoreForTesting()` still works but registration code no longer needs the tool function:

```ts
import { resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
```

2. Delete the unused `SymbolSearchParams` schema block.

3. Delete the entire `registerReadOnlyTool(pi, { name: "symbol_search", ... })` block at the end of `piCodegraph(pi)`.

Update `test/extension-tool-descriptions.test.ts` so the default registered-tool list no longer includes `symbol_search`:

```ts
import { test } from "bun:test";

test("pi extension registers the approved descriptions for the 10 currently registered tools", async () => {
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

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Gate dev-only tool registration behind CODEGRAPH_DEVMODE [depends: 1, 2]

### Task 3: Gate dev-only tool registration behind CODEGRAPH_DEVMODE [depends: 1, 2]

**Files:**
- Modify: `src/index.ts`
- Create: `test/extension-devmode-tools.test.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `test/extension-graph-query.test.ts`
- Modify: `test/extension-graph-query-description.test.ts`
- Modify: `test/tool-graph-overview-wiring.test.ts`
- Modify: `test/tool-dead-code-wiring.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/extension-readonly-trust-gating.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-devmode-tools.test.ts`:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

const DEV_ONLY = ["graph_query", "graph_overview", "dead_code"] as const;
const TRUTHY_VALUES = ["1", "true", "TRUE", "yes", "On"] as const;

function withDevMode<T>(value: string | undefined, callback: () => T): T {
  const previous = process.env.CODEGRAPH_DEVMODE;
  if (value === undefined) delete process.env.CODEGRAPH_DEVMODE;
  else process.env.CODEGRAPH_DEVMODE = value;

  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
}

function registerTools(value?: string): ToolDefinition<any>[] {
  return withDevMode(value, () => {
    const tools: ToolDefinition<any>[] = [];
    const mockPi: ExtensionAPI = {
      registerTool(tool: ToolDefinition<any>) {
        tools.push(tool);
      },
    } as any;

    resetStoreForTesting();
    piCodegraph(mockPi);
    return tools;
  });
}

test("piCodegraph hides dev-only tools by default and does not re-register them after env changes", () => {
  const previous = process.env.CODEGRAPH_DEVMODE;
  delete process.env.CODEGRAPH_DEVMODE;

  try {
    const tools: ToolDefinition<any>[] = [];
    const mockPi: ExtensionAPI = {
      registerTool(tool: ToolDefinition<any>) {
        tools.push(tool);
      },
    } as any;

    resetStoreForTesting();
    piCodegraph(mockPi);
    process.env.CODEGRAPH_DEVMODE = "1";

    for (const name of DEV_ONLY) {
      if (tools.some((tool) => tool.name === name)) {
        throw new Error(`${name} was registered without CODEGRAPH_DEVMODE`);
      }
    }

    if (tools.some((tool) => tool.name === "symbol_search")) {
      throw new Error("symbol_search returned to the registered surface");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});

test("piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value", () => {
  for (const value of TRUTHY_VALUES) {
    const tools = registerTools(value);

    const graphQuery = tools.find((tool) => tool.name === "graph_query");
    const graphOverview = tools.find((tool) => tool.name === "graph_overview");
    const deadCode = tools.find((tool) => tool.name === "dead_code");

    if (!graphQuery || !graphOverview || !deadCode) {
      throw new Error(`dev-only tools were missing for CODEGRAPH_DEVMODE=${value}`);
    }

    if (tools.some((tool) => tool.name === "symbol_search")) {
      throw new Error(`symbol_search returned when CODEGRAPH_DEVMODE=${value}`);
    }

    expect((graphQuery.parameters as any).properties.query).toBeDefined();
    expect(graphOverview.description).toBe(
      "Return a high-level overview of the indexed codebase.\nWhen to use: You need hotspots, distributions, and suggested starting points.",
    );
    expect((deadCode.parameters as any).properties.glob).toBeDefined();
  }
});

test("graph_query keeps its existing runtime behavior when dev mode is enabled", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-devmode-graph-query-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "hello.ts"), "export function hello() { return 'world'; }\n");

  try {
    const tools = registerTools("1");
    const graphQuery = tools.find((tool) => tool.name === "graph_query");
    if (!graphQuery) {
      throw new Error("graph_query was not registered when CODEGRAPH_DEVMODE=1");
    }

    const result = await graphQuery.execute(
      "call-1",
      { query: 'MATCH (a {name: "hello"}) RETURN a' },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    const text = result.content[0]?.text ?? "";
    if (!existsSync(join(projectRoot, ".codegraph", "graph.db"))) {
      throw new Error("graph_query did not auto-index under CODEGRAPH_DEVMODE");
    }
    expect(text).toContain("hello");
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-devmode-tools.test.ts`
Expected: FAIL — `Error: graph_query was registered without CODEGRAPH_DEVMODE`

**Step 3 — Write minimal implementation**
In `src/index.ts`:

1. Import the helper from Task 1:

```ts
import { devModeEnabled } from "./config/dev-mode.js";
```

2. Read the env once at the top of `piCodegraph(pi)`:

```ts
export default function piCodegraph(pi: ExtensionAPI): void {
  const devMode = devModeEnabled();
```

3. Wrap the existing registrations for `graph_query`, `graph_overview`, and `dead_code` in `if (devMode) { ... }` blocks. Keep each tool's existing name, description, parameter schema, execute body, and order unchanged inside the guarded block.

Update the default-surface description test in `test/extension-tool-descriptions.test.ts` so it only asserts the 7 default public tools:

```ts
import { test } from "bun:test";

test("pi extension registers the approved descriptions for the 7 default public tools", async () => {
  const expected = new Map<string, string>([
    ["symbol_graph", "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol."],
    ["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."],
    ["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."],
    ["impact", "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code."],
    ["trace", "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs."],
    ["symbol_card", "Return a compact symbol summary with definition, signature, tests, relationships, and signals."],
    ["symbol_contract", "Return a symbol's behavioral contract from code and tests.\nWhen to use: You need inputs, outputs, throws, or asserted behavior."],
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

Update `test/token-tracker-wiring-check.test.ts` to reflect the new default surface:

```ts
import { expect, test } from "bun:test";

test("the default public tools are registered in the pi extension", async () => {
  const tools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      tools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const expected = [
    "symbol_graph",
    "symbol_card",
    "symbol_contract",
    "trace",
    "impact",
    "resolve_edge",
    "delete_edge",
  ];

  for (const name of expected) {
    expect(tools.find((tool) => tool.name === name)).toBeDefined();
  }
});
```

Update the dev-only wiring tests to opt into dev mode explicitly:

- Replace `test/extension-graph-query.test.ts` with:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pi extension registers graph_query with query schema and auto-indexes on first call when CODEGRAPH_DEVMODE=1", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-gq-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function hello() { return 'world'; }\n");

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    const registeredTools: Array<{ name: string; parameters: any; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: any; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    mod.default(mockPi as any);

    const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
    expect(tool).toBeDefined();
    expect(tool!.parameters.properties.query).toBeDefined();
    expect(tool!.parameters.required).toContain("query");

    const result = await tool!.execute(
      "call-1",
      { query: 'MATCH (a {name: "hello"}) RETURN a' },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("hello");
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

- Replace `test/extension-graph-query-description.test.ts` with:

```ts
import { test } from "bun:test";

test("pi extension registers graph_query with the approved description when CODEGRAPH_DEVMODE=1", async () => {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
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
      throw new Error("graph_query tool was not registered when CODEGRAPH_DEVMODE=1");
    }

    const expected = "Run a Cypher subset query against the graph.\nWhen to use: You need an ad hoc graph slice that is easier to express as a query.";
    if (tool.description !== expected) {
      throw new Error(`graph_query description mismatch: ${tool.description}`);
    }
    if (tool.description.includes('MATCH (a {name: "hello"}) RETURN a')) {
      throw new Error("graph_query description still includes inline examples");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

- Replace `test/tool-graph-overview-wiring.test.ts` with:

```ts
import { expect, test } from "bun:test";

test("pi extension registers graph_overview with no required parameters when CODEGRAPH_DEVMODE=1", async () => {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    const { default: piCodegraph } = await import("../src/index.js");
    piCodegraph(mockPi as any);

    const tool = registeredTools.find((candidate) => candidate.name === "graph_overview");
    expect(tool).toBeDefined();
    expect((tool!.parameters as any).required ?? []).toEqual([]);
    expect((tool as any).ptc?.readOnly).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

- Replace `test/tool-dead-code-wiring.test.ts` with:

```ts
import { expect, test } from "bun:test";

test("pi extension registers dead_code with the existing schema when CODEGRAPH_DEVMODE=1", async () => {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: unknown; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    const { default: piCodegraph } = await import("../src/index.js");
    piCodegraph(mockPi as any);

    const tool = registeredTools.find((candidate) => candidate.name === "dead_code");
    expect(tool).toBeDefined();

    const schema = tool!.parameters as any;
    expect(schema.required ?? []).toEqual([]);
    expect(schema.properties.name).toBeDefined();
    expect(schema.properties.file).toBeDefined();
    expect(schema.properties.kind).toBeDefined();
    expect(schema.properties.glob).toBeDefined();
    expect((tool as any).ptc?.readOnly).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

Update the readonly extension tests to force dev mode anywhere they register extension tools for `graph_query`:

- In `test/extension-readonly-trust-gating.test.ts`, replace `registerTools()` with:

```ts
function registerTools() {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
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
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
}
```

- In `test/readonly-graceful-degradation.test.ts`, add this helper near the top of the file:

```ts
function withCodegraphDevMode<T>(callback: () => T): T {
  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
}
```

Then replace each `mod.default(mockPi as any);` call with:

```ts
withCodegraphDevMode(() => mod.default(mockPi as any));
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-devmode-tools.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Add symbol_graph include schema without changing default output [depends: 3]

### Task 4: Add symbol_graph include schema without changing default output [depends: 3]

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph-include-schema.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-include-schema.test.ts`:

```ts
import { expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { computeAnchor } from "../src/output/anchoring.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
test("symbol_graph accepts include:[\"contract\"] in the schema and keeps default output byte-identical", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;
  resetStoreForTesting();
  piCodegraph(mockPi);
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) {
    throw new Error("symbol_graph was not registered");
  }
  const schema = tool.parameters as any;
  if (!schema.properties.include) {
    throw new Error("symbol_graph schema is missing include");
  }
  if (!Value.Check(schema, { name: "foo", include: ["contract"] })) {
    throw new Error('symbol_graph schema rejected include=["contract"]');
  }
  if (Value.Check(schema, { name: "foo", include: ["neighborhood"] })) {
    throw new Error('symbol_graph schema accepted include=["neighborhood"]');
  }
  const projectRoot = join(tmpdir(), `pi-cg-sg-include-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src", "a.ts"), fileContent);
  const store = new SqliteGraphStore();
  try {
    const hash = sha256Hex(fileContent);
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: hash,
      is_exported: true,
    });

    const node = store.findNodes("foo")[0]!;
    const anchor = computeAnchor(node, projectRoot).anchor;
    const withoutInclude = symbolGraph({ name: "foo", store, projectRoot });
    expect(withoutInclude).toBe(
      `## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\n## foo (function)\n${anchor} [entry-point, leaf, untested]\n`,
    );
    const withEmptyInclude = symbolGraph({ name: "foo", include: [] as any, store, projectRoot });
    expect(withEmptyInclude).toBe(withoutInclude);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-include-schema.test.ts`
Expected: FAIL — `Error: symbol_graph schema is missing include`

**Step 3 — Write minimal implementation**
In `src/index.ts`, extend `SymbolGraphParams` and pass `include` through to `symbolGraph`:

```ts
const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  include: Type.Optional(
    Type.Array(
      Type.Union([Type.Literal("contract")]),
      { description: "Optional extra sections to append to the response" },
    ),
  ),
});
```

Update the execute call:

```ts
const text = symbolGraph({
  name: params.name,
  file: params.file,
  include: params.include as Array<"contract"> | undefined,
  store,
  projectRoot,
});
```


In `src/tools/symbol-graph.ts`, extend the params type so the new schema field is accepted without changing default rendering:

```ts
export interface SymbolGraphParams {
  name: string;
  file?: string;
  include?: Array<"contract">;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}
```

Do not change the `symbolGraph()` body yet; this task only adds the schema plumbing so omitted `include` and `include: []` stay byte-identical to current output.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-include-schema.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Append shared contract output from symbol_graph include [depends: 4]

### Task 5: Append shared contract output from symbol_graph include [depends: 4]

**Files:**
- Modify: `src/tools/symbol-contract.ts`
- Modify: `src/tools/symbol-graph.ts`
- Create: `test/tool-symbol-graph-contract-include.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-graph-contract-include.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import * as symbolContractTool from "../src/tools/symbol-contract.js";

function setupContractFixture(): { projectRoot: string; store: SqliteGraphStore; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-contract-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const srcContent = [
    "export function validate(input: string): boolean {",
    "  if (!input) return false;",
    "  if (input.length === 0) throw new Error(\"empty input\");",
    "  return true;",
    "}",
    "",
  ].join("\n");
  const testContent = [
    "test(\"returns true for valid input\", () => {",
    "  expect(validate(\"good\")).toBe(true);",
    "});",
    "",
  ].join("\n");
  writeFileSync(join(projectRoot, "src/validate.ts"), srcContent);
  writeFileSync(join(projectRoot, "test/validate.test.ts"), testContent);
  const store = new SqliteGraphStore();
  const srcHash = sha256Hex(srcContent);
  const testHash = sha256Hex(testContent);
  store.addNode({
    id: "src/validate.ts::validate:1",
    kind: "function",
    name: "validate",
    file: "src/validate.ts",
    start_line: 1,
    end_line: 4,
    content_hash: srcHash,
    is_exported: true,
    signature: "(input: string) => boolean",
  });
  store.addNode({
    id: "test/validate.test.ts::returns true for valid input:1",
    kind: "test",
    name: "returns true for valid input",
    file: "test/validate.test.ts",
    start_line: 1,
    end_line: 3,
    content_hash: testHash,
  });
  store.addEdge({
    source: "src/validate.ts::validate:1",
    target: "test/validate.test.ts::returns true for valid input:1",
    kind: "tested_by",
    provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: srcHash },
    created_at: Date.now(),
  });
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("symbolGraph appends the standalone symbol_contract body when include contains contract", () => {
  const renderSymbolContractBody = (symbolContractTool as any).renderSymbolContractBody as
    | ((params: { name: string; file?: string; store: SqliteGraphStore; projectRoot: string }) => { body: string; hasLocalExceptions: boolean })
    | undefined;
  if (typeof renderSymbolContractBody !== "function") {
    throw new Error("renderSymbolContractBody is not exported from symbol-contract");
  }

  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "validate", store, projectRoot });
    const rendered = renderSymbolContractBody({ name: "validate", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "validate", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "validate", include: ["contract"] as any, store, projectRoot });
    expect(standaloneBody).toBe(rendered.body);
    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});

test("symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol", () => {
  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "doesNotExist", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "doesNotExist", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "doesNotExist", include: ["contract"] as any, store, projectRoot });

    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-graph-contract-include.test.ts`
Expected: FAIL — `Error: renderSymbolContractBody is not exported from symbol-contract`

**Step 3 — Write minimal implementation**
In `src/tools/symbol-contract.ts`, add a shared renderer and keep `symbolContract()` as the trust-header wrapper by replacing the current `symbolContract` implementation with:

```ts
export interface RenderedSymbolContract {
  body: string;
  hasLocalExceptions: boolean;
}
export function renderSymbolContractBody(params: SymbolContractParams): RenderedSymbolContract {
  const { name, file, store, projectRoot } = params;
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return { body, hasLocalExceptions };
  }
  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const lines: string[] = [];
  lines.push(`## Contract: ${node.name}`);
  lines.push(anchor.anchor);
  if (node.signature) {
    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
    if (sigParams.length > 0) {
      lines.push("");
      lines.push("### Takes");
      for (const p of sigParams) {
        lines.push(`  ${p}`);
      }
    }
    if (returnType) {
      lines.push("");
      lines.push("### Returns");
      lines.push(`  ${returnType}`);
    }
  }

  const fullPath = join(projectRoot, node.file);
  if (existsSync(fullPath) && node.start_line && node.end_line) {
    try {
      const fileContent = readFileSync(fullPath, "utf-8");
      const throws = extractThrows(fileContent, node.start_line, node.end_line);
      if (throws.length > 0) {
        lines.push("");
        lines.push("### Throws / Error paths");
        for (const t of throws) {
          lines.push(`  - ${t}`);
        }
      }

      const guards = extractGuards(fileContent, node.start_line, node.end_line);
      if (guards.length > 0) {
        lines.push("");
        lines.push("### Guards / Preconditions");
        for (const g of guards) {
          lines.push(`  - ${g}`);
        }
      }
    } catch {
      // File unreadable — skip throws/guards
    }
  }

  const allNeighbors = store.getNeighbors(node.id);
  const testEdges = allNeighbors.filter(
    (nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id,
  );

  if (testEdges.length > 0) {
    const allBehaviors: Array<{ testName: string; assertions: string[] }> = [];

    for (const te of testEdges) {
      const testNode = te.node;
      const testPath = join(projectRoot, testNode.file);
      if (!existsSync(testPath)) continue;

      try {
        const testContent = readFileSync(testPath, "utf-8");
        const behaviors = extractTestAssertions(testContent);
        for (const b of behaviors) {
          if (b.testName === testNode.name) {
            allBehaviors.push(b);
          }
        }
      } catch {
        // Test file unreadable — skip
      }
    }

    if (allBehaviors.length > 0) {
      lines.push("");
      lines.push(`### Test-evidenced behaviors (from ${testEdges.length} tests)`);
      for (const b of allBehaviors) {
        lines.push(`  ✓ ${b.testName}`);
        for (const a of b.assertions) {
          lines.push(`    ${a}`);
        }
      }
    }
  }
  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}
export function symbolContract(params: SymbolContractParams): string {
  const stats = params.store.getStatistics(params.projectRoot);
  const rendered = renderSymbolContractBody(params);
  return prependTrustHeader(rendered.body, { stats, hasLocalExceptions: rendered.hasLocalExceptions });
}
```

In `src/tools/symbol-graph.ts`, import the shared renderer and replace `symbolGraph()` with:

```ts
import { renderSymbolContractBody } from "./symbol-contract.js";
export function symbolGraph(params: SymbolGraphParams): string {
  const { name, file, include, limit = 10, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  let body: string;
  let hasLocalExceptions = false;

  if (nodes.length === 0) {
    body = `Symbol "${name}" not found`;
  } else if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    body = `${lines.join("\n")}\n`;
    hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
  } else {
    const node = nodes[0]!;
    const symbolAnchor = computeAnchor(node, projectRoot);
    const signalComputer = createSignalComputer(store);
    const allNeighbors = store.getNeighbors(node.id);
    const computeSignals = (nodeId: string) => signalComputer.compute(nodeId);

    const buckets = new Map<string, NeighborResult[]>();
    const unresolvedResults: NeighborResult[] = [];

    for (const nr of allNeighbors) {
      if (nr.node.file.startsWith("__meta__")) {
        continue;
      }
      if (nr.node.file.startsWith("__unresolved__")) {
        unresolvedResults.push(nr);
        continue;
      }

      const direction = nr.edge.target === node.id ? "in" : "out";
      const title = sectionTitle(nr.edge.kind, direction);
      let bucket = buckets.get(title);
      if (!bucket) {
        bucket = [];
        buckets.set(title, bucket);
      }
      bucket.push(nr);
    }

    const sectionOrder = [
      "Callers", "Callees", "Imports", "Imported By",
      "Implemented By", "Implements",
      "Extended By", "Extends",
      "Tested By", "Tests",
      "Co-changes With",
      "Rendered By", "Renders",
      "Routed From", "Routes To",
    ];

    const namedSections: NamedSection[] = [];

    for (const title of sectionOrder) {
      const bucket = buckets.get(title);
      if (bucket && bucket.length > 0) {
        namedSections.push({
          title,
          section: buildSection(bucket, limit, projectRoot, store, computeSignals),
        });
        buckets.delete(title);
      }
    }

    for (const [title, bucket] of buckets) {
      if (bucket.length > 0) {
        namedSections.push({
          title,
          section: buildSection(bucket, limit, projectRoot, store, computeSignals),
        });
      }
    }

    if (unresolvedResults.length > 0) {
      namedSections.push({
        title: "Unresolved",
        section: buildSection(unresolvedResults, limit, projectRoot, store),
      });
    }

    body = formatNeighborhood(
      { name: node.name, kind: node.kind, anchor: symbolAnchor, signals: signalComputer.compute(node.id) },
      namedSections,
    );

    hasLocalExceptions =
      symbolAnchor.stale || namedSections.some((ns) => hasStaleItems(ns.section));
  }
if (include?.includes("contract")) {
    const rendered = renderSymbolContractBody({ name, file, store, projectRoot });
    body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
    hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
  }

  return prependTrustHeader(body, { stats, hasLocalExceptions });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-graph-contract-include.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Reconcile public, dev-mode, and internal docs [no-test] [depends: 3, 5]

### Task 6: Reconcile public, dev-mode, and internal docs [depends: 3, 5] [no-test]

**Justification:** Documentation-only reconciliation of the registered tool surface and the new `symbol_graph.include` option.

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/tool-descriptions.md`

**Step 1 — Make the change**
Update the docs to match the implementation exactly:

- In `README.md`:
  - change the top-level tool count and any "11 tools" wording to the new default public surface
  - split the tool catalog into **Public**, **Dev-mode**, and **Internal** sections
  - keep `symbol_contract` listed as a public tool in this phase
  - document `CODEGRAPH_DEVMODE=1` as the only supported switch for re-exposing `graph_query`, `graph_overview`, and `dead_code`
  - remove `symbol_search` from the public list and note that it remains internal-only
  - mention `symbol_graph({ name, include: ["contract"] })` in the `symbol_graph` section

- In `ARCHITECTURE.md`:
  - update the ASCII tool list and file-layout comments to reflect the new default registered set
  - add a short note near the tool/output-layer overview that `graph_query`, `graph_overview`, and `dead_code` are dev-mode-only behind `CODEGRAPH_DEVMODE`
  - mark `symbol_search` as internal-only

- In `docs/tool-descriptions.md`:
  - keep the style-guide rules intact
  - update the maintenance note so it explicitly calls out the default-vs-dev-mode split and the internal-only `symbol_search`
  - if you mention `symbol_graph.include`, keep it short and style-guide-compliant

**Step 2 — Verify**
Run: `bun test && bun run check`
Expected: all tests passing and type-check clean
