---
id: 1
title: Make static trace headers explicitly heuristic
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/trace.ts
files_to_create:
  - test/tool-trace-static-mode-header.test.ts
---

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
