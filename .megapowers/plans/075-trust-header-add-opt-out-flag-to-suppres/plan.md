# Plan

### Task 1: Add stripTrustHeader helper to read-only-ceremony

Add a pure helper `stripTrustHeader(text: string): string` to `src/output/read-only-ceremony.ts` that removes a complete `## Trust` header block (regardless of status: fresh, stale, mixed, heuristic, runtime-backed) from the head of a string and returns the input unchanged when the head does not match that shape. Covers AC 8, AC 9.

**Files:**
- Modify: `src/output/read-only-ceremony.ts`
- Test: `test/output-strip-trust-header.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/output-strip-trust-header.test.ts`:

```ts
import { expect, test } from "bun:test";
import { stripTrustHeader } from "../src/output/read-only-ceremony.js";

test("stripTrustHeader removes trust header regardless of status", () => {
  for (const status of ["fresh", "stale", "mixed", "heuristic", "runtime-backed"] as const) {
    const input = [
      "## Trust",
      `status: ${status}`,
      "evidence: tree-sitter,lsp  stale-files: 1/183",
      "body line 1",
      "body line 2",
      "",
    ].join("\n");
    const expected = ["body line 1", "body line 2", ""].join("\n");
    const actual = stripTrustHeader(input);
    expect(actual).toBe(expected);
  }
});

test("stripTrustHeader strips the trace mode line that follows the trust header when present", () => {
  const input = [
    "## Trust",
    "status: heuristic",
    "evidence: tree-sitter  stale-files: 0/1",
    "mode: static (heuristic, no runtime evidence)",
    "src/app.ts:1:abcd  entry  function",
    "",
  ].join("\n");
  const stripped = stripTrustHeader(input);
  expect(stripped.startsWith("## Trust")).toBe(false);
  expect(stripped).toContain("src/app.ts:1:abcd  entry  function");
});

test("stripTrustHeader returns input unchanged when no trust header is present", () => {
  const body = "## foo (function)\nsrc/a.ts:1:abcd\n";
  expect(stripTrustHeader(body)).toBe(body);
  expect(stripTrustHeader("")).toBe("");
});

test("stripTrustHeader is idempotent", () => {
  const input = [
    "## Trust",
    "status: stale",
    "evidence: tree-sitter  stale-files: 1/10",
    "rows: 1",
    "",
  ].join("\n");
  const once = stripTrustHeader(input);
  const twice = stripTrustHeader(once);
  expect(twice).toBe(once);
});

test("stripTrustHeader does not strip a partial/malformed trust block", () => {
  const input = ["## Trust", "status: stale", "no evidence line here", "rows: 1"].join("\n");
  expect(stripTrustHeader(input)).toBe(input);
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-strip-trust-header.test.ts`

Expected: FAIL — `SyntaxError: Export named 'stripTrustHeader' not found in module '/Users/maxwellnewman/pi/workspace/pi-codegraph/src/output/read-only-ceremony.ts'.`

(Verified by probe: `bun test` emits exactly this error when importing a non-existent named export from an existing module.)

**Step 3 — Write minimal implementation**

Edit `src/output/read-only-ceremony.ts`. Current full contents:

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

Append after the existing export:

```ts
export function stripTrustHeader(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text;
  if (lines[0] !== "## Trust") return text;
  if (!(lines[1] ?? "").startsWith("status: ")) return text;
  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
  return lines.slice(3).join("\n");
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-strip-trust-header.test.ts`
Expected: PASS — all 5 tests pass.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing (no existing tests import `stripTrustHeader`, and `suppressFreshTrustHeader` semantics are unchanged).

### Task 2: Thread suppressTrustHeader flag through finalizeReadOnlyOutput and symbol_graph [depends: 1]

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

### Task 3: Thread suppressTrustHeader flag through impact [depends: 2]

Extend `ImpactParams` with an optional boolean `suppressTrustHeader` and update the `impact` execute call site to forward the flag into `finalizeReadOnlyOutput`. Covers AC 1 (impact), AC 2 (impact), AC 4, AC 6 (impact).

**Files:**
- Modify: `src/index.ts` (ImpactParams schema + impact execute call site)
- Test: `test/extension-suppress-trust-header-impact.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/extension-suppress-trust-header-impact.test.ts`:

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
test("impact schema advertises suppressTrustHeader as an optional boolean", () => {
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "impact");
  if (!tool) throw new Error("impact was not registered");
  const schema = tool.parameters as any;
  const prop = schema.properties.suppressTrustHeader;
  if (!prop) throw new Error("impact schema is missing suppressTrustHeader");
  expect(prop.type).toBe("boolean");
  const required: string[] = schema.required ?? [];
  expect(required.includes("suppressTrustHeader")).toBe(false);
});

test("impact with suppressTrustHeader:true omits the Trust header on a stale graph", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const sharedOrig = "export function shared() { return 1; }\n";
  const callerOrig = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  writeFileSync(join(projectRoot, "src", "shared.ts"), sharedOrig);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerOrig);

  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const seed = new SqliteGraphStore(dbPath);
  for (const rel of ["src/shared.ts", "src/caller.ts"] as const) {
    const content = rel === "src/shared.ts" ? sharedOrig : callerOrig;
    const extracted = extractFile(rel, content);
    seed.addNode(extracted.module);
    for (const node of extracted.nodes) seed.addNode(node);
    for (const edge of extracted.edges) seed.addEdge(edge);
    seed.setFileHash(rel, sha256Hex(content));
  }
  // Manually add the resolved caller → shared calls edge so impact can traverse it.
  // (extractFile alone produces only unresolved cross-file edges.)
  seed.addEdge({
    source: "src/caller.ts::caller:2",
    target: "src/shared.ts::shared:1",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "shared:2",
      content_hash: sha256Hex(callerOrig),
    },
    created_at: 1,
  });
  seed.close();

  // Mutate shared to make files stale, then lock DB readonly.
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 2; }\n");
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "impact");
  if (!tool) throw new Error("impact was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { symbols: ["shared"], changeType: "signature_change" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText).toContain("## Trust\nstatus: stale");
    expect(baselineText).toContain("caller");
    const suppressed = await (tool as any).execute(
      "suppressed",
      { symbols: ["shared"], changeType: "signature_change", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("caller");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-suppress-trust-header-impact.test.ts`

Expected: FAIL — the first test throws `Error: impact schema is missing suppressTrustHeader`. After that is fixed, the second test also fails because the flag is ignored: `expect(received).toBe(expected)` with `Expected: false` / `Received: true` on `suppressedText.includes("## Trust")`.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`.

(a) Extend `ImpactParams` (currently defined around the top of the file). Append a property inside `Type.Object({...})`:

```ts
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
    {
      description:
        'Kind of change. Allowed values: "signature_change", "removal", "behavior_change", "addition".',
    },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({
      description:
        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
    }),
  ),
});
```

(b) Update the `impact` execute call site. Find:

```ts
const output = finalizeReadOnlyOutput("impact", { symbols: params.symbols }, text, store, projectRoot);
```

Replace with:

```ts
const output = finalizeReadOnlyOutput(
  "impact",
  { symbols: params.symbols },
  text,
  store,
  projectRoot,
  params.suppressTrustHeader === true,
);
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-suppress-trust-header-impact.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing (including `test/extension-impact.test.ts` and `test/tool-impact-trust-header.test.ts`).

### Task 4: Thread suppressTrustHeader flag through trace [depends: 2]

Extend `TraceParams` with an optional boolean `suppressTrustHeader` and update the `trace` execute call site to forward the flag into `finalizeReadOnlyOutput`. Covers AC 1 (trace), AC 2 (trace), AC 5, AC 6 (trace).

**Files:**
- Modify: `src/index.ts` (TraceParams schema + trace execute call site)
- Test: `test/extension-suppress-trust-header-trace.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/extension-suppress-trust-header-trace.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

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

test("trace schema advertises suppressTrustHeader as an optional boolean", () => {
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");
  const schema = tool.parameters as any;
  const prop = schema.properties.suppressTrustHeader;
  if (!prop) throw new Error("trace schema is missing suppressTrustHeader");
  expect(prop.type).toBe("boolean");
  const required: string[] = schema.required ?? [];
  expect(required.includes("suppressTrustHeader")).toBe(false);
});

test("trace with suppressTrustHeader:true omits the non-fresh Trust header", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");

  try {
    const suppressed = await (tool as any).execute(
      "call-1",
      { entry: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("mode: static (heuristic, no runtime evidence)");

    const baseline = await (tool as any).execute(
      "call-2",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-suppress-trust-header-trace.test.ts`

Expected: FAIL — `Error: trace schema is missing suppressTrustHeader` (first test throws), and the second test's suppressed output still contains `## Trust` because the flag is ignored by trace's execute.

**Step 3 — Write minimal implementation**

Edit `src/index.ts`.

(a) Extend `TraceParams`. Current definition:

```ts
const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
});
```

Replace with:

```ts
const TraceParams = Type.Object({
  entry: Type.String({ description: "Entry symbol or endpoint name" }),
  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
  suppressTrustHeader: Type.Optional(
    Type.Boolean({
      description:
        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
    }),
  ),
});
```

(b) Update the `trace` execute call site. Find:

```ts
const output = finalizeReadOnlyOutput("trace", { entry: params.entry, file: params.file }, text, store, projectRoot);
```

Replace with:

```ts
const output = finalizeReadOnlyOutput(
  "trace",
  { entry: params.entry, file: params.file },
  text,
  store,
  projectRoot,
  params.suppressTrustHeader === true,
);
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-suppress-trust-header-trace.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing (including `test/tool-trace-trust-heuristic.test.ts`, `test/tool-trace-trust-runtime.test.ts`, and `test/extension-readonly-trust-gating.test.ts`).

### Task 5: Assert suppressTrustHeader does not affect indexing-failed note, devmeta footer, or body content [depends: 2, 3, 4]

Lock in that `suppressTrustHeader: true` suppresses only the `## Trust` block — the `indexing-failed (<N>s ago): ...` note, the `_meta: tokens_saved` footer when `CODEGRAPH_DEVMETA=1`, and body content (anchors, signals, mode lines) all remain identical to a baseline call. Covers AC 6 (fresh + flag = idempotent, byte-identical to baseline), AC 7 (`suppressTrustHeader: false` vs omitted via `trace`), AC 11 (`_meta` footer intact under `CODEGRAPH_DEVMETA=1`), AC 12 (`indexing-failed` note intact), AC 13 (non-Trust body content intact on both fresh and stale graphs), and AC 14 (default `suppressFreshTrustHeader` path still runs on a fresh graph).

**Files:**
- Test: `test/extension-suppress-trust-header-interactions.test.ts` (create)

**Step 1 — Write the failing test**

Create `test/extension-suppress-trust-header-interactions.test.ts`:

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

function createProject(slug: string): string {
  const root = join(tmpdir(), `pi-cg-suppress-interactions-${slug}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return root;
}

test("suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-suppress-idxfail-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

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
    const result = await (tool as any).execute(
      "call-with-flag",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;
    expect(text.includes("## Trust")).toBe(false);
    expect(text).toMatch(/indexing-failed \(\d+s ago\): readonly database/);
    expect(text).toContain("## foo (function)");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:true still appends _meta footer when CODEGRAPH_DEVMETA=1", async () => {
  const projectRoot = createProject("devmeta");
  const previous = process.env.CODEGRAPH_DEVMETA;
  process.env.CODEGRAPH_DEVMETA = "1";
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const result = await (tool as any).execute(
      "call-1",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;
    expect(text.includes("## Trust")).toBe(false);
    expect(text).toContain("_meta:");
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMETA;
    else process.env.CODEGRAPH_DEVMETA = previous;
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)", async () => {
  const projectRoot = createProject("body-fresh");
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    // Fresh-graph calls already have the Trust header suppressed by suppressFreshTrustHeader.
    expect(baselineText.includes("## Trust")).toBe(false);
    expect(baselineText).toContain("## foo (function)");

    const suppressed = await (tool as any).execute(
      "call-2",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText).toBe(baselineText);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph)", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-suppress-body-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

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
    const baselineLines = baselineText.split("\n");
    const trustIndex = baselineLines.indexOf("## Trust");
    expect(trustIndex).toBeGreaterThanOrEqual(0);
    // Body = everything after the 3-line Trust block (## Trust / status:.../ evidence:...).
    const afterTrust = baselineLines.slice(trustIndex + 3).join("\n");

    const suppressed = await (tool as any).execute(
      "suppressed",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toBe(afterTrust);
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh)", async () => {
  const projectRoot = createProject("default-trace");
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");

  try {
    const omitted = await (tool as any).execute(
      "call-1",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const explicit = await (tool as any).execute(
      "call-2",
      { entry: "foo", file: "src/app.ts", suppressTrustHeader: false },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const omittedText = (omitted.content[0] as any).text as string;
    const explicitText = (explicit.content[0] as any).text as string;
    expect(omittedText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
    expect(explicitText).toBe(omittedText);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-suppress-trust-header-interactions.test.ts`

Expected: **PASS if Tasks 1–4 are already implemented** (since this task verifies their combined contract). If any prior task regressed the contract, expect a specific failure such as:
- `expect(text.includes("## Trust")).toBe(false)` failing with the Trust header still present (flag not wired), or
- `expect(text).toContain("_meta:")` failing when devmeta is toggled on (flag accidentally suppressing the footer).

To force a true RED before writing this test in order: comment out the `params.suppressTrustHeader === true` argument in `src/index.ts` symbol_graph call site and re-run — observe the first assertion failing with `expect(received).toBe(expected) // received: true, expected: false` on `text.includes("## Trust")`. Uncomment before proceeding.

**Step 3 — Write minimal implementation**

No new production code is required — the assertions are satisfied by the wiring landed in Tasks 1–4 plus the existing `finalizeReadOnlyOutput`, `indexingFailedNote`, and `appendTokenMetaIfEnabled` pipeline. This task exists to lock the composed behavior (AC 11/12/13/7/14) with explicit tests.

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-suppress-trust-header-interactions.test.ts`
Expected: PASS — all 5 tests pass.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing.
