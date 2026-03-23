---
id: 2
title: Verify DFS handles cycles without infinite loops
status: approved
depends_on:
  - 1
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-trace-static-cycle.test.ts
---

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
