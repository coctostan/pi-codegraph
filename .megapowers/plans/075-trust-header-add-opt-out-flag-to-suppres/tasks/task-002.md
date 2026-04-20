---
id: 2
title: Thread suppressTrustHeader flag through finalizeReadOnlyOutput and symbol_graph
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-suppress-trust-header-symbol-graph.test.ts
---

Extend `SymbolGraphParams` with an optional boolean `suppressTrustHeader`, extend `finalizeReadOnlyOutput` to accept a `suppressTrustHeader` argument that (when true) applies `stripTrustHeader` to the tool body, and update the `symbol_graph` execute call site to pass the flag. Covers AC 1 (symbol_graph), AC 2 (symbol_graph), AC 3, AC 6 (symbol_graph), AC 10 (centralization).

**Files:**
- Modify: `src/index.ts` (SymbolGraphParams schema, finalizeReadOnlyOutput signature, symbol_graph execute)
- Test: `test/extension-suppress-trust-header-symbol-graph.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/extension-suppress-trust-header-symbol-graph.test.ts`:

```ts
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
function register(): ToolDefinition<any>[] {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;
  resetStoreForTesting();
  piCodegraph(mockPi);
  return tools;
}
test("symbol_graph schema advertises suppressTrustHeader as an optional boolean", () => {
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");
  const schema = tool.parameters as any;
  const prop = schema.properties.suppressTrustHeader;
  if (!prop) throw new Error("symbol_graph schema is missing suppressTrustHeader");
  expect(prop.type).toBe("boolean");
  const required: string[] = schema.required ?? [];
  expect(required.includes("suppressTrustHeader")).toBe(false);
});

test("symbol_graph with suppressTrustHeader:true omits the Trust header on a stale graph", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

  // Seed the persisted store so a readonly-DB + mutated-source path produces status: stale.
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const seed = new SqliteGraphStore(dbPath);
  const extracted = extractFile("src/app.ts", original);
  seed.addNode(extracted.module);
  for (const node of extracted.nodes) seed.addNode(node);
  for (const edge of extracted.edges) seed.addEdge(edge);
  seed.setFileHash("src/app.ts", sha256Hex(original));
  seed.close();
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 2; }\nexport function foo() { return bar(); }\n",
  );
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText).toContain("## Trust\nstatus: stale");
    expect(baselineText).toContain("## foo (function)");
    const suppressed = await (tool as any).execute(
      "suppressed",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("## foo (function)");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-suppress-trust-header-symbol-graph.test.ts`

Expected: FAIL — the first test throws `Error: symbol_graph schema is missing suppressTrustHeader`. After that is fixed (schema addition), the second test also fails because the flag is ignored: `expect(received).toBe(expected)` with `Expected: false` / `Received: true` on `suppressedText.includes("## Trust")`.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`.

(a) Extend `SymbolGraphParams` (currently defined at top of file). Add a third property inside `Type.Object({...})`:

```ts
const SymbolGraphParams = Type.Object({
  name: Type.String({ description: "Symbol name to look up" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  include: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("neighborhood"),
        Type.Literal("contract"),
        Type.Literal("source"),
      ]),
      {
        description:
          'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.',
      },
    ),
  ),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({
      description:
        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
    }),
  ),
});
```

(b) Update the import list at the top of the file to include `stripTrustHeader`:

```ts
import { suppressFreshTrustHeader, stripTrustHeader } from "./output/read-only-ceremony.js";
```

(c) Extend `finalizeReadOnlyOutput` to accept and apply the flag. Replace the current signature + body:

```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
  suppressTrustHeader: boolean = false,
): string {
  const afterFreshStrip = suppressFreshTrustHeader(toolOutput);
  const afterHeaderStrip = suppressTrustHeader ? stripTrustHeader(afterFreshStrip) : afterFreshStrip;
  const withIndexingNote = indexingFailedNote() + afterHeaderStrip;
  if (
    lastIndexError &&
    lastIndexError.error.message !== "readonly database" &&
    afterHeaderStrip.trim().length > 0
  ) {
    lastIndexError = null;
  }
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

(d) Update the `symbol_graph` execute call site to pass the flag. Find the line:

```ts
const output = finalizeReadOnlyOutput("symbol_graph", { name: params.name, file: params.file }, text, store, projectRoot);
```

Replace with:

```ts
const output = finalizeReadOnlyOutput(
  "symbol_graph",
  { name: params.name, file: params.file },
  text,
  store,
  projectRoot,
  params.suppressTrustHeader === true,
);
```

Do NOT yet update the `impact` or `trace` execute call sites — those come in tasks 3 and 4. The extra parameter on `finalizeReadOnlyOutput` defaults to `false`, so existing callers are unaffected.

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-suppress-trust-header-symbol-graph.test.ts`
Expected: PASS — both tests pass.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing. In particular, `test/output-readonly-ceremony.test.ts`, `test/tool-symbol-graph-trust-header.test.ts`, `test/extension-readonly-trust-gating.test.ts`, and `test/tool-symbol-graph-include-schema.test.ts` must still pass (default behavior unchanged).
