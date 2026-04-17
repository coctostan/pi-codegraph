---
id: 3
title: Gate dev-only tool registration behind CODEGRAPH_DEVMODE
status: approved
depends_on:
  - 1
  - 2
no_test: false
files_to_modify:
  - src/index.ts
  - test/extension-tool-descriptions.test.ts
  - test/extension-graph-query.test.ts
  - test/extension-graph-query-description.test.ts
  - test/tool-graph-overview-wiring.test.ts
  - test/tool-dead-code-wiring.test.ts
  - test/token-tracker-wiring-check.test.ts
  - test/extension-readonly-trust-gating.test.ts
  - test/readonly-graceful-degradation.test.ts
files_to_create:
  - test/extension-devmode-tools.test.ts
---

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
