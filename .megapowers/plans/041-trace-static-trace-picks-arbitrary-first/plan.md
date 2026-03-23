# Plan

### Task 1: Rewrite buildStaticTrace to DFS all branches

**Files:**
- Modify: `src/tools/trace.ts`
- Test: `test/repro-041-trace-static-arbitrary-first.test.ts`

**Step 1 — Write the failing test**

The repro test already exists at `test/repro-041-trace-static-arbitrary-first.test.ts`. No changes needed — it sets up `indexProject` with 3 callees (`walkFiles`, `runLsp`, `runCoverage`) and asserts all 3 appear in the trace output.

```typescript
// test/repro-041-trace-static-arbitrary-first.test.ts (already exists, no changes)
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace static mode includes all callees, not just the alphabetically-first one", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-branches-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "pipeline.ts"),
    [
      "export function indexProject() { walkFiles(); runLsp(); runCoverage(); }",
      "export function walkFiles() {}",
      "export function runLsp() {}",
      "export function runCoverage() {}",
    ].join("\n") + "\n",
  );

  const store = new SqliteGraphStore();
  try {
    const indexProject = {
      id: "src/pipeline.ts::indexProject:1", kind: "function" as const, name: "indexProject",
      file: "src/pipeline.ts", start_line: 1, end_line: 1, content_hash: "h1",
    };
    const walkFiles = {
      id: "src/pipeline.ts::walkFiles:2", kind: "function" as const, name: "walkFiles",
      file: "src/pipeline.ts", start_line: 2, end_line: 2, content_hash: "h1",
    };
    const runLsp = {
      id: "src/pipeline.ts::runLsp:3", kind: "function" as const, name: "runLsp",
      file: "src/pipeline.ts", start_line: 3, end_line: 3, content_hash: "h1",
    };
    const runCoverage = {
      id: "src/pipeline.ts::runCoverage:4", kind: "function" as const, name: "runCoverage",
      file: "src/pipeline.ts", start_line: 4, end_line: 4, content_hash: "h1",
    };

    store.addNode(indexProject);
    store.addNode(walkFiles);
    store.addNode(runLsp);
    store.addNode(runCoverage);

    store.addEdge({
      source: indexProject.id, target: walkFiles.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "walkFiles()", content_hash: "h1" },
      created_at: 1,
    });
    store.addEdge({
      source: indexProject.id, target: runLsp.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "runLsp()", content_hash: "h1" },
      created_at: 2,
    });
    store.addEdge({
      source: indexProject.id, target: runCoverage.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "runCoverage()", content_hash: "h1" },
      created_at: 3,
    });

    const output = trace({ entry: "indexProject", file: "src/pipeline.ts", store, projectRoot });

    // The trace SHOULD include all 3 callees
    expect(output).toContain("indexProject");
    expect(output).toContain("walkFiles");
    expect(output).toContain("runLsp");
    expect(output).toContain("runCoverage");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/repro-041-trace-static-arbitrary-first.test.ts`
Expected: FAIL — `error: expect(received).toContain(expected)` / `Expected to contain: "runLsp"`

**Step 3 — Write minimal implementation**

Replace `buildStaticTrace` in `src/tools/trace.ts` (lines 38-52) with iterative DFS that visits all branches:

```typescript
function buildStaticTrace(store: GraphStore, startNodeId: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [startNodeId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    ordered.push(currentId);

    const nextNeighbors = store.getNeighbors(currentId, { direction: "out", kind: "calls" });
    const sorted = nextNeighbors.sort((a, b) =>
      a.node.file.localeCompare(b.node.file) || a.node.start_line - b.node.start_line || a.node.id.localeCompare(b.node.id)
    );
    // Push in reverse so first-in-sort-order is popped first (DFS pre-order)
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!seen.has(sorted[i].node.id)) {
        stack.push(sorted[i].node.id);
      }
    }
  }

  return ordered;
}
```

This changes the algorithm from "follow one chain" to "iterative DFS visiting all branches." The sort order is preserved for determinism. The `seen` set prevents infinite loops on cycles. Output remains a flat list of node IDs.

**Step 4 — Run test, verify it passes**

Run: `bun test test/repro-041-trace-static-arbitrary-first.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing (existing linear-chain tests like `tool-trace-static-fallback.test.ts` and `tool-trace-static-mode-header.test.ts` continue to pass since a linear chain is a degenerate case of DFS)

### Task 2: Verify DFS handles cycles without infinite loops [depends: 1]

**Files:**
- Create: `test/tool-trace-static-cycle.test.ts`
- Test: `test/tool-trace-static-cycle.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-trace-static-cycle.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace static DFS terminates on recursive call cycles and includes all reachable nodes once", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-cycle-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "rec.ts"),
    "export function alpha() { beta(); gamma(); }\nexport function beta() { alpha(); }\nexport function gamma() {}\n",
  );

  const store = new SqliteGraphStore();
  try {
    const alpha = {
      id: "src/rec.ts::alpha:1", kind: "function" as const, name: "alpha",
      file: "src/rec.ts", start_line: 1, end_line: 1, content_hash: "h1",
    };
    const beta = {
      id: "src/rec.ts::beta:2", kind: "function" as const, name: "beta",
      file: "src/rec.ts", start_line: 2, end_line: 2, content_hash: "h1",
    };
    const gamma = {
      id: "src/rec.ts::gamma:3", kind: "function" as const, name: "gamma",
      file: "src/rec.ts", start_line: 3, end_line: 3, content_hash: "h1",
    };

    store.addNode(alpha);
    store.addNode(beta);
    store.addNode(gamma);

    // alpha → beta, alpha → gamma
    store.addEdge({
      source: alpha.id, target: beta.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "beta()", content_hash: "h1" },
      created_at: 1,
    });
    store.addEdge({
      source: alpha.id, target: gamma.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "gamma()", content_hash: "h1" },
      created_at: 2,
    });
    // beta → alpha (cycle!)
    store.addEdge({
      source: beta.id, target: alpha.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "alpha()", content_hash: "h1" },
      created_at: 3,
    });

    const output = trace({ entry: "alpha", file: "src/rec.ts", store, projectRoot });

    // Must terminate (not hang) and include all 3 nodes exactly once
    expect(output).toContain("alpha");
    expect(output).toContain("beta");
    expect(output).toContain("gamma");

    // Each name should appear exactly once in the step lines (not the trust header)
    const stepLines = output.split("\n").filter((l) => l.includes("function"));
    expect(stepLines).toHaveLength(3);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-trace-static-cycle.test.ts`

This test exercises the cycle (alpha→beta→alpha) plus a sibling branch (alpha→gamma). Before Task 1's fix, this would only follow alpha→beta (then stop because alpha is already seen), missing gamma entirely.

Expected: FAIL — `error: expect(received).toContain(expected)` / `Expected to contain: "gamma"` (if run before Task 1) or PASS (if Task 1 is already applied — in which case this confirms the DFS handles cycles correctly)

**Step 3 — Write minimal implementation**

No additional production code needed. The DFS implementation from Task 1 already handles this via the `seen` set. This task is a pure verification test.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-trace-static-cycle.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing

### Task 3: Update trace tool description for multi-branch semantics [depends: 1]

**Files:**
- Modify: `src/index.ts`
- Modify: `test/extension-trace-description.test.ts`
- Test: `test/extension-trace-description.test.ts`

**Step 1 — Write the failing test**

Update the existing description assertion in `test/extension-trace-description.test.ts` to match the new multi-branch description. Change lines 28-30:

```typescript
// test/extension-trace-description.test.ts — replace the toBe assertion (lines 28-30) with:
  expect(traceTool!.description).toBe(
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
```

Full file after edit:

```typescript
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
    "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
  );
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/extension-trace-description.test.ts`
Expected: FAIL — `error: expect(received).toBe(expected)` — the current description says "Use trace to follow one path" but the test expects "Use trace to follow all reachable branches"

**Step 3 — Write minimal implementation**

In `src/index.ts`, update line 209 — change the description string:

```typescript
      "Return one deterministic anchored execution path for a test, symbol, or endpoint. Results may be coverage-backed or static heuristics. Use trace to follow all reachable branches, symbol_graph to inspect neighborhoods, and impact to inspect downstream dependents.",
```

The only change is `"follow one path"` → `"follow all reachable branches"`.

**Step 4 — Run test, verify it passes**

Run: `bun test test/extension-trace-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing
