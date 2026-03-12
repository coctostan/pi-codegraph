# Plan

### Task 1: Make static trace headers explicitly heuristic

### Task 1: Make static trace headers explicitly heuristic

**Covers:** AC2, AC3, AC8
**Files:**
- Create: `test/tool-trace-static-mode-header.test.ts`
- Modify: `src/tools/trace.ts`
- Test: `test/tool-trace-static-mode-header.test.ts`
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";
test("trace marks static fallback paths as heuristic without changing step lines", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-mode-header-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n",
  );
  const store = new SqliteGraphStore();
  try {
    const entry = {
      id: "src/app.ts::entry:1",
      kind: "function" as const,
      name: "entry",
      file: "src/app.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "h-app",
    };
    const first = {
      id: "src/app.ts::first:2",
      kind: "function" as const,
      name: "first",
      file: "src/app.ts",
      start_line: 2,
      end_line: 2,
      content_hash: "h-app",
    };
    const second = {
      id: "src/app.ts::second:3",
      kind: "function" as const,
      name: "second",
      file: "src/app.ts",
      start_line: 3,
      end_line: 3,
      content_hash: "h-app",
    };
    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    store.addEdge({
      source: entry.id,
      target: first.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first", content_hash: entry.content_hash },
      created_at: 1,
    });
    store.addEdge({
      source: first.id,
      target: second.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second", content_hash: first.content_hash },
      created_at: 2,
    });

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    const lines = output.trim().split("\n");

    expect(lines[0]).toBe("mode: static (heuristic, no runtime evidence)");
    expect(lines[1]).toContain("src/app.ts:1:");
    expect(lines[1]).toContain("entry  function");
    expect(lines).toHaveLength(4);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-trace-static-mode-header.test.ts`
Expected: FAIL — `Expected: "mode: static (heuristic, no runtime evidence)"` / `Received: "mode: static"`

**Step 3 — Write minimal implementation**
In `src/tools/trace.ts`, add a helper that formats the first-line mode label:

```ts
function formatModeHeader(mode: "coverage" | "static", stale = false): string {
  const base = mode === "coverage"
    ? "mode: coverage"
    : "mode: static (heuristic, no runtime evidence)";
  return `${base}${stale ? " [stale]" : ""}`;
}
```

Then update only the static fallback return site to use the helper:

```ts
  const staticSteps = buildStaticTrace(params.store, node.id);
  return `${[formatModeHeader("static"), ...staticSteps.map((step) => formatLiveTraceLine(params.store, step, params.projectRoot))].join("\n")}\n`;
```

Do not add any extra warning line, free-form prose, or per-step annotations. Do not change the step-line renderer.
**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-trace-static-mode-header.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Rewrite trace tool description for agent usage

### Task 2: Rewrite trace tool description for agent usage

**Covers:** AC5, AC6, AC7

**Files:**
- Create: `test/extension-trace-description.test.ts`
- Modify: `src/index.ts`
- Test: `test/extension-trace-description.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";

test("pi extension registers trace tool with an agent-oriented description", async () => {
  const registeredTools: Array<{
    name: string;
    description: string;
    parameters: unknown;
    execute: Function;
  }> = [];

  const mockPi = {
    registerTool(tool: {
      name: string;
      description: string;
      parameters: unknown;
      execute: Function;
    }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const { default: piCodegraph } = await import("../src/index.js");
  piCodegraph(mockPi as any);

  const traceTool = registeredTools.find((tool) => tool.name === "trace");
  expect(traceTool).toBeDefined();
  expect(traceTool!.description).toBe(
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-trace-description.test.ts`
Expected: FAIL — `Expected: "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents."` / `Received: "Return one deterministic anchored execution path for a test, symbol, or endpoint"`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the trace tool description inside the `pi.registerTool({ name: "trace", ... })` block with this exact string:

```ts
"Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents."
```

The full trace registration block should read:

```ts
  pi.registerTool({
    name: "trace",
    label: "Trace",
    description:
      "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow one path, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
    parameters: TraceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-trace-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Route coverage headers through the shared mode formatter [no-test] [depends: 1]

### Task 3: Route coverage headers through the shared mode formatter [depends: 1] [no-test]

**Covers:** AC1, AC4

**Justification:** Pure refactor. `trace` already emits `mode: coverage` and `mode: coverage [stale]`; this task only routes the coverage branch through the shared formatter introduced in Task 1 so coverage and static headers cannot drift apart. Existing tests already cover the observable behavior.
**Files:**
- Modify: `src/tools/trace.ts`
**Step 1 — Make the change**
In `src/tools/trace.ts`, update the coverage-backed return site to use the shared `formatModeHeader()` helper introduced in Task 1:

```ts
  if (coverageTraceId) {
    const coverage = params.store.getTestTrace(coverageTraceId);
    if (coverage) {
      const rendered = coverage.steps.sort((a, b) => a.ordinal - b.ordinal).map((step) => formatStoredTraceLine(params.store, step.nodeId, step.contentHash, params.projectRoot));
      const traceStale = rendered.some((item) => item.stale);
      return `${[formatModeHeader("coverage", traceStale), ...rendered.map((item) => item.line)].join("\n")}\n`;
    }
  }
```

Do not change any step-line formatting.

**Step 2 — Verify**
Run: `bun test test/tool-trace-coverage.test.ts test/tool-trace-stale.test.ts`
Expected: PASS
