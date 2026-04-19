---
id: 1
title: Add empty-array guard at impact() tool entry (Case A)
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-empty-symbols.test.ts
---

Covers Fixed-When criterion #1 (Case A — empty array at `impact()`) and criterion #6 (minimal example in error body). Creates the regression test file scaffold that Tasks 2–4 extend, and adds the first defensive guard.

**Files:**
- Create: `test/tool-impact-empty-symbols.test.ts`
- Modify: `src/tools/impact.ts`

**Step 1 — Write the failing test**

Verified existing signature via `read src/tools/impact.ts symbol: impact` — current signature is:
```ts
export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string
```

Create `test/tool-impact-empty-symbols.test.ts` with content:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function setupProjectWithGraph() {
  const projectRoot = join(tmpdir(), `pi-cg-impact-empty-symbols-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  const store = new SqliteGraphStore();
  store.addNode({
    id: "src/shared.ts::shared:1",
    kind: "function",
    name: "shared",
    file: "src/shared.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
    is_exported: true,
  });
  return { projectRoot, store };
}

test("impact() returns Trust-header-wrapped error with example when symbols is empty array", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: [],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
    // Exit-criterion #5: error body contains a minimal invocation example
    expect(out).toContain("impact({");
    expect(out).toContain("changeType");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: FAIL — Bun will print an assertion failure like:
```
error: expect(received).toContain(expected)
Expected substring: "symbols"
Received: "## Trust
status: fresh
evidence: tree-sitter  stale-files: 0/0
"
```
(Reproduction already confirmed the current output contains only the Trust header — no "symbols" substring in the body.)

**Step 3 — Write minimal implementation**

In `src/tools/impact.ts`, locate the `impact()` function (starts around line 131). Between the `getStatistics` call and the `for (const symbol of params.symbols)` loop, insert an empty-array guard. The edit should turn:

```ts
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  for (const symbol of params.symbols) {
```

into:

```ts
}): string {
  const stats = params.store.getStatistics(params.projectRoot);

  if (params.symbols.length === 0) {
    return prependTrustHeader(
      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
      { stats },
    );
  }

  for (const symbol of params.symbols) {
```

(Use `params.symbols.length === 0` — not `!params.symbols` — so Task 2 gets a real RED when it adds the `undefined` test case.)

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-impact-empty-symbols.test.ts`

Expected: PASS — the single new test passes.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all tests pass, including the existing `test/tool-impact*.test.ts` and `test/extension-impact.test.ts` files.
