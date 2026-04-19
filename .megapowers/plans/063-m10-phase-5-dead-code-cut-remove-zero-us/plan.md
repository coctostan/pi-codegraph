# Plan

### Task 1: Document the current Phase 5 baseline and local-history verification [no-test]

### Task 1: Document the current Phase 5 baseline and local-history verification [no-test]

**Justification:** planning artifact only; this task records the current repo state and the verification limitation required by AC1 and AC2.

**Files:**
- Create: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`

**Step 1 — Make the change**
Create `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md` with these sections and facts:

```md
# Phase 5 Summary

## Baseline
- Phase 5 is **not already complete** in the current repo state.
- `src/index.ts` still registers `resolve_edge` and `delete_edge` on the default public surface.
- `README.md` still documents `resolve_edge` and `delete_edge` as default public tools.
- Existing tests still assert that surface (`test/extension-wiring.test.ts`, `test/extension-tool-descriptions.test.ts`, `test/token-tracker-wiring-check.test.ts`, plus the current `resolve_edge` runtime coverage in `test/extension-auto-index.test.ts` and `test/readonly-graceful-degradation.test.ts`).

## Phase 3 / Phase 4 verification attempt
- Verification was attempted from both repo state and git history.
- Local git history shows Phase 3 evidence at `801e702d feat: ship 061-m10-phase-3-demote-graph-query-graph-ove (#40)`.
- Local / remote-visible history shows Phase 4 evidence at `3fbd3ca5 feat: unify symbol lookup on symbol_graph (#41)` and `101e5578 feat: unify symbol lookup on symbol_graph`.
- Live GitHub PR status/title confirmation was **not** available through the current `gh_status` path, so this summary treats local git history as the primary verification source.

## Next required evidence
- Record the post-Phase-4 telemetry window.
- Record per-tool call counts for `resolve_edge`, `delete_edge`, `graph_query`, `graph_overview`, and `dead_code`.
- Record the re-checked Phase 3 structural-question pick-rate result before making any keep/delete change.
```

**Step 2 — Verify**
Run: `grep -nE 'Phase 5 is \*\*not already complete\*\*|801e702d|3fbd3ca5|101e5578|gh_status|resolve_edge|delete_edge' .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`
Expected: the baseline bullets, both local-history references, and the GitHub-verification limitation are all present.

### Task 2: Record the telemetry window and materialize the decision matrix [no-test] [depends: 1]

### Task 2: Record the telemetry window and materialize the decision matrix [no-test] [depends: 1]

**Covers:** AC3, AC4

**Justification:** external telemetry and pick-rate evidence are required inputs, not product behavior. This task captures that evidence in a durable artifact and a typed helper so every later keep/delete task reads the same observed counts and decisions.
**Files:**
- Modify: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`
- Create: `test/phase5-decision-matrix.ts`

**Step 1 — Make the change**
Append a `## Telemetry window and decisions` section to `summary.md` with the **actual** externally supplied data:
```md
## Telemetry window and decisions
- Observation window: <real start/end dates or duration>
- Phase 3 re-check: <real result showing structural-question pick-rate increased after Phase 3, or an explicit stop-the-line note if it did not>
| Tool | Surface | Calls in window | Decision | Evidence note |
| --- | --- | ---: | --- | --- |
| resolve_edge | public | <real count> | <keep/delete> | <why> |
| delete_edge | public | <real count> | <keep/delete> | <why> |
| graph_query | dev | <real count> | <keep/delete> | <why> |
| graph_overview | dev | <real count> | <keep/delete> | <why> |
| dead_code | dev | <real count> | <keep/delete> | <why> |
```

Then create `test/phase5-decision-matrix.ts` as the single test-side source of truth for those decisions:

```ts
export type Phase5Tool =
  | "resolve_edge"
  | "delete_edge"
  | "graph_query"
  | "graph_overview"
  | "dead_code";

export type Phase5Decision = {
  surface: "public" | "dev";
  calls: number;
  decision: "keep" | "delete";
  evidence: string;
};
export const phase5ToolDecisions: Record<Phase5Tool, Phase5Decision> = {
  resolve_edge: { surface: "public", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  delete_edge: { surface: "public", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  graph_query: { surface: "dev", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  graph_overview: { surface: "dev", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
  dead_code: { surface: "dev", calls: /* real count */, decision: /* real decision */, evidence: /* real note */ },
};
export function isRemoved(name: Phase5Tool): boolean {
  return phase5ToolDecisions[name].decision === "delete";
}
export const removedMutatingTools = (["resolve_edge", "delete_edge"] as const).filter((name) =>
  isRemoved(name),
);
export const removedDevTools = (["graph_query", "graph_overview", "dead_code"] as const).filter((name) =>
  isRemoved(name),
);
export const expectedDefaultPublicTools = [
  "symbol_graph",
  "impact",
  "trace",
  ...(["resolve_edge", "delete_edge"] as const).filter((name) => !isRemoved(name)),
];

export const expectedDevModeTools = (["graph_query", "graph_overview", "dead_code"] as const).filter(
  (name) => !isRemoved(name),
);
export const expectedDefaultPublicToolDescriptions = new Map<string, string>([
  [
    "symbol_graph",
    "Return a compact symbol summary with relationships, test signals, and key metadata.\nWhen to use: You need structural context for a named symbol.",
  ],
  ...(!isRemoved("resolve_edge")
    ? [["resolve_edge", "Create an evidence-backed edge in the symbol graph.\nWhen to use: The graph is missing a relationship you can justify from code or docs."]]
    : []),
  ...(!isRemoved("delete_edge")
    ? [["delete_edge", "Delete an agent-created edge from the symbol graph.\nWhen to use: An agent-added relationship is incorrect or obsolete."]]
    : []),
  [
    "impact",
    "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
  ],
  [
    "trace",
    "Return the execution path starting from an entry point. Coverage-backed when available.\nWhen to use: You need to understand what actually runs.",
  ],
]);
```

Replace every `/* real ... */` placeholder with the actual telemetry-backed values before saving the file. Do not leave placeholder comments in the committed artifact.
**Step 2 — Verify**
Run:
```bash
if grep -R "real count\|real decision\|real note\|<real" \
  .megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md \
  test/phase5-decision-matrix.ts; then
  echo 'placeholders remain'
  exit 1
fi
bun -e 'import { phase5ToolDecisions, expectedDefaultPublicTools, removedMutatingTools, removedDevTools } from "./test/phase5-decision-matrix.ts"; if (Object.keys(phase5ToolDecisions).length !== 5) throw new Error("phase5ToolDecisions must contain 5 tools"); console.log(expectedDefaultPublicTools.length, removedMutatingTools.length, removedDevTools.length);'
```
Expected: the grep step prints nothing, the Bun import step exits 0, and the final line prints three integers for the default-public count, removed-mutating count, and removed-dev count.

### Task 3: Record the keep-branch regression checks for non-zero tools [no-test] [depends: 2]

### Task 3: Record the keep-branch regression checks for non-zero tools [no-test] [depends: 2]

**Covers:** AC4, AC7

**Justification:** when telemetry says a candidate stays on the surface, the implementation branch is verification-only. This task records and runs the existing regression suites that protect each kept tool's actual runtime guarantees.
**Files:**
- Modify: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`

**Step 1 — Make the change**
Append a `## Keep-branch verification` section to `summary.md` with the exact command to run for each tool whose Task 2 decision is `keep`:

```md
## Keep-branch verification
- `resolve_edge` keep -> `bun test test/extension-wiring.test.ts test/extension-tool-descriptions.test.ts test/extension-auto-index.test.ts test/readonly-graceful-degradation.test.ts test/tool-resolve-edge.test.ts test/tool-resolve-edge-empty-evidence.test.ts test/tool-resolve-edge-self-ref.test.ts`
- `delete_edge` keep -> `bun test test/extension-wiring.test.ts test/extension-tool-descriptions.test.ts test/token-tracker-wiring-check.test.ts test/tool-delete-edge.test.ts`
- `graph_query` keep -> `bun test test/extension-devmode-tools.test.ts test/extension-graph-query.test.ts test/extension-graph-query-description.test.ts test/extension-readonly-trust-gating.test.ts test/readonly-graceful-degradation.test.ts test/tool-graph-query-*.test.ts`
- `graph_overview` keep -> `bun test test/extension-devmode-tools.test.ts test/tool-graph-overview-*.test.ts test/token-tracker-all-tools.test.ts test/token-tracker-naive-files.test.ts`
- `dead_code` keep -> `bun test test/extension-devmode-tools.test.ts test/tool-dead-code-*.test.ts test/token-tracker-all-tools.test.ts`
```

Then run only the commands for the tools marked `keep` in `test/phase5-decision-matrix.ts`, and add one bullet per kept tool confirming that the command passed unchanged.
**Step 2 — Verify**
Run: `bun test`
Expected: all tests pass, and `summary.md` contains one passed keep-branch command for every tool whose Task 2 decision is `keep`. The keep commands must include the direct tool suites listed above, not only extension wiring tests.

### Task 4: Apply the zero-usage resolve_edge removal [depends: 2]

### Task 4: Apply the zero-usage resolve_edge removal [depends: 2]

**Covers:** AC5, AC8

Run this task only when `phase5ToolDecisions.resolve_edge.decision === "delete"` in `test/phase5-decision-matrix.ts`.
**Files:**
- Create: `test/phase5-resolve-edge-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/extension-wiring.test.ts`
- Modify: `test/extension-auto-index.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`
- Delete: `test/tool-resolve-edge.test.ts`
- Delete: `test/tool-resolve-edge-empty-evidence.test.ts`
- Delete: `test/tool-resolve-edge-self-ref.test.ts`
- Test: `test/phase5-resolve-edge-surface.test.ts`
**Step 1 — Write the failing test**
Create `test/phase5-resolve-edge-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits resolve_edge when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("resolve_edge")) return;
  const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
  mod.default(mockPi as any);

  if (registeredTools.some((tool) => tool.name === "resolve_edge")) {
    throw new Error("resolve_edge is still registered after the Phase 5 cut");
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-resolve-edge-surface.test.ts`
Expected: FAIL — `error: resolve_edge is still registered after the Phase 5 cut`
**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `resolveEdge` import, the `ResolveEdgeParams` schema, and the `pi.registerTool({ name: "resolve_edge", ... })` block. That block currently calls `resolveEdge({ source, target, sourceFile, targetFile, kind, evidence, store, projectRoot })`, so removing the registration must also remove the now-unused schema and import.
2. Replace `test/extension-tool-descriptions.test.ts` with the decision-matrix-driven version below so public-surface descriptions automatically drop `resolve_edge` when it is deleted:

```ts
import { test } from "bun:test";
import { expectedDefaultPublicToolDescriptions } from "./phase5-decision-matrix.js";
test("pi extension registers the approved descriptions for the default public tools", async () => {
  const expected = expectedDefaultPublicToolDescriptions;
  const expectedIncludeDescription =
    'Optional extra sections. Allowed values: "neighborhood", "contract", "source". "tests" is not a valid include value.';
  const registeredTools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
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
    if (!tool.description.trim()) throw new Error(`empty description for ${tool.name}`);
    const wanted = expected.get(tool.name);
    if (!wanted) throw new Error(`unexpected tool registered: ${tool.name}`);
    if (tool.description !== wanted) {
      throw new Error(`description mismatch for ${tool.name}: ${tool.description}`);
    }
  }
  const symbolGraph = registeredTools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraph) throw new Error("symbol_graph was not registered");
  const includeDescription = symbolGraph.parameters?.properties?.include?.description;
  if (includeDescription !== expectedIncludeDescription) {
    throw new Error(`symbol_graph include description mismatch: ${includeDescription}`);
  }
});
```

3. Replace `test/token-tracker-wiring-check.test.ts` with:

```ts
import { expect, test } from "bun:test";
import { expectedDefaultPublicTools } from "./phase5-decision-matrix.js";
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
  for (const name of expectedDefaultPublicTools) {
    expect(tools.find((tool) => tool.name === name)).toBeDefined();
  }
});
```

4. In `test/extension-wiring.test.ts`, add `import { isRemoved } from "./phase5-decision-matrix.js";` and wrap only the current `resolve_edge` schema test:

```ts
if (!isRemoved("resolve_edge")) {
  test("pi extension registers resolve_edge tool with correct schema", async () => {
    // keep the current test body unchanged
  });
}
```

5. Replace the first test in `test/extension-auto-index.test.ts` with the `impact`-based singleton check below. This uses the current `resetStoreForTesting(): void`, `getSharedStoreForTesting(): GraphStore | null`, and `impact({ symbols, changeType, store, projectRoot, maxDepth? })` signatures that already exist in `src/index.ts` and `src/tools/impact.ts`:

```ts
test("extension shares singleton store instance across symbol_graph and impact", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-singleton-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/alpha.ts"),
    "export function alpha() {}\nexport function beta() { alpha(); }\n",
  );

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    let sgExecute: Function | undefined;
    let impactExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "impact") impactExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);
    const ctx = { cwd: projectRoot };
    await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const first = mod.getSharedStoreForTesting();
    await impactExecute!(
      "call-2",
      { symbols: ["alpha"], changeType: "behavior_change" },
      undefined,
      undefined,
      ctx,
    );
    const second = mod.getSharedStoreForTesting();
    expect(first).toBeDefined();
    expect(second).toBe(first);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

6. In `test/readonly-graceful-degradation.test.ts`, add `import { isRemoved } from "./phase5-decision-matrix.js";` and wrap only the current `resolve_edge returns clear error message on readonly DB instead of crashing` test in `if (!isRemoved("resolve_edge")) { ... }`.
7. Delete the pure `resolve_edge` test files: `test/tool-resolve-edge.test.ts`, `test/tool-resolve-edge-empty-evidence.test.ts`, and `test/tool-resolve-edge-self-ref.test.ts`.
**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-resolve-edge-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `resolve_edge` anywhere in the suite.

### Task 5: Apply the zero-usage delete_edge removal [depends: 2]

### Task 5: Apply the zero-usage delete_edge removal [depends: 2]

**Covers:** AC5, AC8

Run this task only when `phase5ToolDecisions.delete_edge.decision === "delete"` in `test/phase5-decision-matrix.ts`.
**Files:**
- Create: `test/phase5-delete-edge-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `test/extension-tool-descriptions.test.ts`
- Modify: `test/token-tracker-wiring-check.test.ts`
- Modify: `test/extension-wiring.test.ts`
- Delete: `test/tool-delete-edge.test.ts`
- Test: `test/phase5-delete-edge-surface.test.ts`
**Step 1 — Write the failing test**
Create `test/phase5-delete-edge-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";
test("pi extension omits delete_edge when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("delete_edge")) return;
    const registeredTools: Array<{ name: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };
    const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);
  if (registeredTools.some((tool) => tool.name === "delete_edge")) {
    throw new Error("delete_edge is still registered after the Phase 5 cut");
  }
});
```
**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-delete-edge-surface.test.ts`
Expected: FAIL — `error: delete_edge is still registered after the Phase 5 cut`
**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `deleteEdge` import, the `DeleteEdgeParams` schema, and the `pi.registerTool({ name: "delete_edge", ... })` block. That block currently calls `deleteEdge({ source, target, sourceFile, targetFile, kind, store, projectRoot })`, so the schema and import must disappear with the registration.
2. Replace `test/extension-tool-descriptions.test.ts` with the decision-matrix-driven file that imports `expectedDefaultPublicToolDescriptions` from `./phase5-decision-matrix.js`, compares the registered tool names to `expected.keys()`, and verifies the exact `symbol_graph` include-description text.
3. Replace `test/token-tracker-wiring-check.test.ts` with the decision-matrix-driven file that imports `expectedDefaultPublicTools` from `./phase5-decision-matrix.js` and asserts every expected default public tool is registered.
4. In `test/extension-wiring.test.ts`, add `import { isRemoved } from "./phase5-decision-matrix.js";` if it is not already present, and wrap only the current `delete_edge` schema test:

```ts
if (!isRemoved("delete_edge")) {
  test("pi extension registers delete_edge tool with correct schema", async () => {
    // keep the current test body unchanged
  });
}
```

5. Delete `test/tool-delete-edge.test.ts`, because it is a pure `delete_edge` assertion file and AC8 requires removed tools to disappear from the asserted surface entirely.
**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-delete-edge-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `delete_edge` anywhere in the suite.

### Task 6: Apply the zero-usage graph_query removal [depends: 2]

### Task 6: Apply the zero-usage graph_query removal [depends: 2]

**Covers:** AC6, AC8

Run this task only when `phase5ToolDecisions.graph_query.decision === "delete"` in `test/phase5-decision-matrix.ts`.
**Files:**
- Create: `test/phase5-graph-query-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `src/tools/token-tracker.ts`
- Modify: `test/extension-devmode-tools.test.ts`
- Modify: `test/extension-graph-query-description.test.ts`
- Modify: `test/extension-graph-query.test.ts`
- Modify: `test/extension-readonly-trust-gating.test.ts`
- Modify: `test/readonly-graceful-degradation.test.ts`
- Delete: `test/tool-graph-query-*.test.ts`
- Test: `test/phase5-graph-query-surface.test.ts`

**Step 1 — Write the failing test**
Create `test/phase5-graph-query-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits graph_query when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("graph_query")) return;

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string }> = [];
    const mockPi = {
      registerTool(tool: { name: string }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);

    if (registeredTools.some((tool) => tool.name === "graph_query")) {
      throw new Error("graph_query is still registered after the Phase 5 cut");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-graph-query-surface.test.ts`
Expected: FAIL — `error: graph_query is still registered after the Phase 5 cut`

**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `graphQuery` import, the `GraphQueryParams` schema, and the `registerReadOnlyTool(pi, { name: "graph_query", ... })` block inside the `if (devMode)` section.
2. In `src/tools/token-tracker.ts`, remove the `case "graph_query":` label from `collectNaiveFiles()`. After this task, the grouped all-files branch should begin with `case "graph_overview":` and `case "dead_code":` only.
3. Replace `test/extension-devmode-tools.test.ts` with a helper-driven version that uses the real decision matrix for every dev tool and keeps the runtime test only when `graph_query` remains on the surface:

```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { isRemoved, phase5ToolDecisions } from "./phase5-decision-matrix.js";

const DEV_TOOLS = ["graph_query", "graph_overview", "dead_code"] as const;
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

test("piCodegraph hides all dev-only tools by default and never re-registers them after env changes", () => {
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

    for (const name of DEV_TOOLS) {
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

test("piCodegraph registers exactly the kept dev-only tools for every approved CODEGRAPH_DEVMODE truthy value", () => {
  for (const value of TRUTHY_VALUES) {
    const tools = registerTools(value);

    for (const name of DEV_TOOLS) {
      const exists = tools.some((tool) => tool.name === name);
      const shouldExist = phase5ToolDecisions[name].decision === "keep";
      if (exists !== shouldExist) {
        throw new Error(`${name} registration mismatch for CODEGRAPH_DEVMODE=${value}`);
      }
    }

    if (tools.some((tool) => tool.name === "symbol_search")) {
      throw new Error(`symbol_search returned when CODEGRAPH_DEVMODE=${value}`);
    }
  }
});

if (!isRemoved("graph_query")) {
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
        { cwd: projectRoot } as any,
      );

      const text = (result.content[0] as any)?.text ?? "";
      if (!existsSync(join(projectRoot, ".codegraph", "graph.db"))) {
        throw new Error("graph_query did not auto-index under CODEGRAPH_DEVMODE");
      }
      expect(text).toContain("hello");
    } finally {
      resetStoreForTesting();
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
}
```

4. Add `import { isRemoved } from "./phase5-decision-matrix.js";` and wrap every graph-query-specific test body in these files with `if (!isRemoved("graph_query")) { ... }`:
   - `test/extension-graph-query-description.test.ts`
   - `test/extension-graph-query.test.ts`
   - `test/extension-readonly-trust-gating.test.ts`
   - the graph-query-specific blocks in `test/readonly-graceful-degradation.test.ts`
5. Delete every pure graph-query assertion file: `test/tool-graph-query-edge-where.test.ts`, `test/tool-graph-query-empty-query.test.ts`, `test/tool-graph-query-execution-error-detail.test.ts`, `test/tool-graph-query-execution-error.test.ts`, `test/tool-graph-query-invalid-suggestion.test.ts`, `test/tool-graph-query-node.test.ts`, `test/tool-graph-query-render-edge.test.ts`, `test/tool-graph-query-render-empty.test.ts`, `test/tool-graph-query-render-node.test.ts`, `test/tool-graph-query-render-stale.test.ts`, `test/tool-graph-query-single-quote-where.test.ts`, `test/tool-graph-query-traversal-edge-alias.test.ts`, `test/tool-graph-query-traversal-no-edge-alias.test.ts`, `test/tool-graph-query-trust-header.test.ts`, and `test/tool-graph-query-unsupported-suggestion.test.ts`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-graph-query-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `graph_query` anywhere in the suite.

### Task 7: Apply the zero-usage graph_overview removal [depends: 2]

### Task 7: Apply the zero-usage graph_overview removal [depends: 2]

**Covers:** AC6, AC8

Run this task only when `phase5ToolDecisions.graph_overview.decision === "delete"` in `test/phase5-decision-matrix.ts`.

**Files:**
- Create: `test/phase5-graph-overview-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `src/tools/token-tracker.ts`
- Modify: `test/extension-devmode-tools.test.ts`
- Modify: `test/token-tracker-all-tools.test.ts`
- Modify: `test/token-tracker-naive-files.test.ts`
- Delete: `test/tool-graph-overview-hubs.test.ts`
- Delete: `test/tool-graph-overview-imports.test.ts`
- Delete: `test/tool-graph-overview-queries.test.ts`
- Delete: `test/tool-graph-overview-stats.test.ts`
- Delete: `test/tool-graph-overview-wiring.test.ts`
- Test: `test/phase5-graph-overview-surface.test.ts`

**Step 1 — Write the failing test**
Create `test/phase5-graph-overview-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits graph_overview when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("graph_overview")) return;

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string }> = [];
    const mockPi = {
      registerTool(tool: { name: string }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);

    if (registeredTools.some((tool) => tool.name === "graph_overview")) {
      throw new Error("graph_overview is still registered after the Phase 5 cut");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-graph-overview-surface.test.ts`
Expected: FAIL — `error: graph_overview is still registered after the Phase 5 cut`

**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `graphOverview` import, the `GraphOverviewParams` schema, and the `registerReadOnlyTool(pi, { name: "graph_overview", ... })` block inside the `if (devMode)` section.
2. In `src/tools/token-tracker.ts`, remove the `case "graph_overview":` label from `collectNaiveFiles()`. After this task, the grouped all-files branch must mention only the kept dev-mode tools from `graph_query` and `dead_code`.
3. Replace `test/extension-devmode-tools.test.ts` with a helper-driven file that imports `isRemoved` and `phase5ToolDecisions` from `./phase5-decision-matrix.js`, checks all three dev tools against the real keep/delete decisions under `CODEGRAPH_DEVMODE=1`, and keeps the existing `graph_query` runtime test only inside `if (!isRemoved("graph_query")) { ... }`.
4. Replace `test/token-tracker-all-tools.test.ts` with the helper-aware version below so session accumulation only exercises kept dev-mode tools:

```ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession, appendTokenMeta } from "../src/tools/token-tracker.js";
import { impact } from "../src/tools/impact.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { deadCode } from "../src/tools/dead-code.js";
import { isRemoved } from "./phase5-decision-matrix.js";

beforeEach(() => {
  resetSession();
});

function makeTestEnv() {
  const projectRoot = join(tmpdir(), `pi-cg-meta-all-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  const hashA = sha256Hex(fileA);
  store.setFileHash("src/a.ts", hashA);
  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
  return { projectRoot, store, cleanup: () => { store.close(); rmSync(projectRoot, { recursive: true, force: true }); } };
}

test("appendTokenMeta works with impact", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = impact({ symbols: ["foo"], changeType: "behavior_change", store, projectRoot });
    const output = appendTokenMeta("impact", { symbols: ["foo"] }, text, store, projectRoot);
    expect(output).toContain("_meta:");
    expect(output).toContain("session_calls:1");
  } finally {
    cleanup();
  }
});

test("session accumulates across the kept dev-mode tool calls", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    let callCount = 0;

    if (!isRemoved("graph_overview")) {
      const t1 = graphOverview({ store, projectRoot });
      const o1 = appendTokenMeta("graph_overview", {}, t1, store, projectRoot);
      callCount += 1;
      expect(o1).toContain(`session_calls:${callCount}`);
    }

    if (!isRemoved("dead_code")) {
      const t2 = deadCode({ store, projectRoot });
      const o2 = appendTokenMeta("dead_code", {}, t2, store, projectRoot);
      callCount += 1;
      expect(o2).toContain(`session_calls:${callCount}`);
    }
  } finally {
    cleanup();
  }
});
```

5. Replace `test/token-tracker-naive-files.test.ts` with:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { collectNaiveFiles } from "../src/tools/token-tracker.js";
import { isRemoved } from "./phase5-decision-matrix.js";

test("collectNaiveFiles for symbol_graph returns target + neighbor files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });
    const files = collectNaiveFiles("symbol_graph", { name: "foo" }, store);
    expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  } finally { store.close(); }
});

test("collectNaiveFiles for impact returns downstream files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/b.ts::bar:1", target: "src/a.ts::foo:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h2" }, created_at: Date.now() });
    const files = collectNaiveFiles("impact", { symbols: ["foo"] }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally { store.close(); }
});

if (!isRemoved("graph_overview")) {
  test("collectNaiveFiles for graph_overview returns all indexed files", () => {
    const store = new SqliteGraphStore();
    try {
      store.setFileHash("src/a.ts", "h1");
      store.setFileHash("src/b.ts", "h2");
      const files = collectNaiveFiles("graph_overview", {}, store);
      expect(files.sort()).toEqual(["src/a.ts", "src/b.ts"]);
    } finally { store.close(); }
  });
}

test("collectNaiveFiles for trace returns traced path files", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::entry:1", kind: "function", name: "entry", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h1", is_exported: true });
    store.addNode({ id: "src/b.ts::callee:1", kind: "function", name: "callee", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: "h2", is_exported: true });
    store.addEdge({ source: "src/a.ts::entry:1", target: "src/b.ts::callee:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "h1" }, created_at: Date.now() });
    const files = collectNaiveFiles("trace", { entry: "entry" }, store);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
  } finally { store.close(); }
});
```

6. Delete the pure graph_overview assertion files: `test/tool-graph-overview-hubs.test.ts`, `test/tool-graph-overview-imports.test.ts`, `test/tool-graph-overview-queries.test.ts`, `test/tool-graph-overview-stats.test.ts`, and `test/tool-graph-overview-wiring.test.ts`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-graph-overview-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `graph_overview` anywhere in the suite.

### Task 8: Apply the zero-usage dead_code removal [depends: 2]

### Task 8: Apply the zero-usage dead_code removal [depends: 2]

**Covers:** AC6, AC8

Run this task only when `phase5ToolDecisions.dead_code.decision === "delete"` in `test/phase5-decision-matrix.ts`.

**Files:**
- Create: `test/phase5-dead-code-surface.test.ts`
- Modify: `src/index.ts`
- Modify: `src/tools/token-tracker.ts`
- Modify: `test/extension-devmode-tools.test.ts`
- Modify: `test/token-tracker-all-tools.test.ts`
- Delete: `test/tool-dead-code-single-referenced.test.ts`
- Delete: `test/tool-dead-code-single-unreferenced.test.ts`
- Delete: `test/tool-dead-code-sweep-filters.test.ts`
- Delete: `test/tool-dead-code-sweep.test.ts`
- Delete: `test/tool-dead-code-wiring.test.ts`
- Test: `test/phase5-dead-code-surface.test.ts`

**Step 1 — Write the failing test**
Create `test/phase5-dead-code-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { isRemoved } from "./phase5-decision-matrix.js";

test("pi extension omits dead_code when Phase 5 marks it for deletion", async () => {
  if (!isRemoved("dead_code")) return;

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const registeredTools: Array<{ name: string }> = [];
    const mockPi = {
      registerTool(tool: { name: string }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);

    if (registeredTools.some((tool) => tool.name === "dead_code")) {
      throw new Error("dead_code is still registered after the Phase 5 cut");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/phase5-dead-code-surface.test.ts`
Expected: FAIL — `error: dead_code is still registered after the Phase 5 cut`

**Step 3 — Write minimal implementation**
1. In `src/index.ts`, remove the `deadCode` import, the `DeadCodeParams` schema, and the `registerReadOnlyTool(pi, { name: "dead_code", ... })` block inside the `if (devMode)` section.
2. In `src/tools/token-tracker.ts`, remove the `case "dead_code":` label from `collectNaiveFiles()`. After this task, the grouped all-files branch must mention only the kept dev-mode tools from `graph_query` and `graph_overview`, or disappear entirely if both of those tools were also removed.
3. Replace `test/extension-devmode-tools.test.ts` with a helper-driven file that imports `isRemoved` and `phase5ToolDecisions` from `./phase5-decision-matrix.js`, checks all three dev tools against the real keep/delete decisions under `CODEGRAPH_DEVMODE=1`, and keeps the existing `graph_query` runtime test only inside `if (!isRemoved("graph_query")) { ... }`.
4. Replace `test/token-tracker-all-tools.test.ts` with the helper-aware version below so session accumulation only exercises kept dev-mode tools:

```ts
import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession, appendTokenMeta } from "../src/tools/token-tracker.js";
import { impact } from "../src/tools/impact.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { deadCode } from "../src/tools/dead-code.js";
import { isRemoved } from "./phase5-decision-matrix.js";

beforeEach(() => {
  resetSession();
});

function makeTestEnv() {
  const projectRoot = join(tmpdir(), `pi-cg-meta-all-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  const hashA = sha256Hex(fileA);
  store.setFileHash("src/a.ts", hashA);
  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
  return { projectRoot, store, cleanup: () => { store.close(); rmSync(projectRoot, { recursive: true, force: true }); } };
}

test("appendTokenMeta works with impact", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = impact({ symbols: ["foo"], changeType: "behavior_change", store, projectRoot });
    const output = appendTokenMeta("impact", { symbols: ["foo"] }, text, store, projectRoot);
    expect(output).toContain("_meta:");
    expect(output).toContain("session_calls:1");
  } finally {
    cleanup();
  }
});

test("session accumulates across the kept dev-mode tool calls", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    let callCount = 0;

    if (!isRemoved("graph_overview")) {
      const t1 = graphOverview({ store, projectRoot });
      const o1 = appendTokenMeta("graph_overview", {}, t1, store, projectRoot);
      callCount += 1;
      expect(o1).toContain(`session_calls:${callCount}`);
    }

    if (!isRemoved("dead_code")) {
      const t2 = deadCode({ store, projectRoot });
      const o2 = appendTokenMeta("dead_code", {}, t2, store, projectRoot);
      callCount += 1;
      expect(o2).toContain(`session_calls:${callCount}`);
    }
  } finally {
    cleanup();
  }
});
```

5. Delete the pure dead_code assertion files: `test/tool-dead-code-single-referenced.test.ts`, `test/tool-dead-code-single-unreferenced.test.ts`, `test/tool-dead-code-sweep-filters.test.ts`, `test/tool-dead-code-sweep.test.ts`, and `test/tool-dead-code-wiring.test.ts`.

**Step 4 — Run test, verify it passes**
Run: `bun test test/phase5-dead-code-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing, with no remaining registration or test assertion for `dead_code` anywhere in the suite.

### Task 9: Reconcile README and ARCHITECTURE with the final Phase 5 surface [no-test] [depends: 2, 4, 5, 6, 7, 8]

### Task 9: Reconcile README and ARCHITECTURE with the final Phase 5 surface [no-test] [depends: 2, 4, 5, 6, 7, 8]

**Covers:** AC8

**Justification:** documentation-only reconciliation. This task runs after the zero-usage keep/delete tasks so the saved summary, README, and ARCHITECTURE reflect the final observed surface instead of the pre-cut baseline.

**Files:**
- Modify: `.megapowers/plans/063-m10-phase-5-dead-code-cut-remove-zero-us/summary.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`

**Step 1 — Make the change**
1. Update the tool-count bullets, tool tables, examples, and file-layout sections in `README.md` so they exactly match the final Task 2 decision matrix.
   - If a tool is deleted, remove its top-level listing, dedicated subsection, and example call.
   - If a tool is kept, leave its documentation intact.
   - Update the visible count text so it matches the final surface, not the pre-Phase-5 baseline.
2. Update the public/dev/internal surface descriptions in `ARCHITECTURE.md` to match the same final tool set.
3. Append a `## Final surface` section to `summary.md` that lists:
   - final default public tools
   - final dev-mode tools
   - every deleted tool with its observed call count and a short evidence note
   - every kept tool with its observed call count and a short evidence note

**Step 2 — Verify**
Run:
```bash
bun -e 'import { expectedDefaultPublicTools, expectedDevModeTools, phase5ToolDecisions } from "./test/phase5-decision-matrix.ts"; import { readFileSync } from "node:fs"; const readme = readFileSync("README.md", "utf8"); const architecture = readFileSync("ARCHITECTURE.md", "utf8"); const docs = `${readme}\n${architecture}`; const removed = Object.entries(phase5ToolDecisions).filter(([, decision]) => decision.decision === "delete").map(([name]) => name); for (const name of removed) { if (docs.includes(`\`${name}\``)) throw new Error(`documentation still lists removed tool: ${name}`); } for (const name of expectedDefaultPublicTools) { if (!docs.includes(`\`${name}\``)) throw new Error(`documentation is missing public tool: ${name}`); } for (const name of expectedDevModeTools) { if (!docs.includes(`\`${name}\``)) throw new Error(`documentation is missing dev tool: ${name}`); } if (!readme.includes(`${expectedDefaultPublicTools.length} public tools by default`)) throw new Error("README public-tool count mismatch"); if (!readme.includes(`${expectedDevModeTools.length} dev-mode`)) throw new Error("README dev-mode count mismatch"); if (!architecture.includes(`Default registration exposes ${expectedDefaultPublicTools.length} public tools.`)) throw new Error("ARCHITECTURE public-tool count mismatch"); console.log("documentation matches final surface");' && bun test
```
Expected: `documentation matches final surface`, then the full Bun suite passes.
