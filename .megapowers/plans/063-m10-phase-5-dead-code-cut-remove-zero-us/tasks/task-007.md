---
id: 7
title: Apply the zero-usage graph_overview removal
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/index.ts
  - src/tools/token-tracker.ts
  - test/extension-devmode-tools.test.ts
  - test/tool-graph-overview-hubs.test.ts
  - test/tool-graph-overview-imports.test.ts
  - test/tool-graph-overview-queries.test.ts
  - test/tool-graph-overview-stats.test.ts
  - test/tool-graph-overview-wiring.test.ts
  - test/token-tracker-all-tools.test.ts
  - test/token-tracker-naive-files.test.ts
files_to_create:
  - test/phase5-graph-overview-surface.test.ts
---

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
