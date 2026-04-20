---
id: 4
title: Thread suppressTrustHeader flag through trace
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-suppress-trust-header-trace.test.ts
---

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
