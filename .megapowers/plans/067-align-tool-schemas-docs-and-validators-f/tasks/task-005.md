---
id: 5
title: "Lock down: no open-ended suffixes in audited parameter descriptions"
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/closed-enum-no-open-suffix.test.ts
---

Covers AC 17.

**Files:**
- Create: `test/closed-enum-no-open-suffix.test.ts`

**Step 1 — Write the failing test**

Create `test/closed-enum-no-open-suffix.test.ts`:

```ts
import { test } from "bun:test";

async function registered(): Promise<Array<{ name: string; description: string; parameters?: any }>> {
  const tools: Array<{ name: string; description: string; parameters?: any }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string; parameters?: any }) {
      tools.push(tool);
    },
    on() {},
  };
  const mod = await import("../src/index.js");
  if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
  (mod as any).default(mockPi as any);
  return tools;
}

function check(desc: string, label: string) {
  if (desc.includes("...")) {
    throw new Error(`${label} description contains "...": ${desc}`);
  }
  // Match "etc." as a token (avoid false positives on future "etcetera", etc.)
  if (/\betc\.\B|\betc\./.test(desc) || desc.includes(" etc.") || desc.endsWith("etc.")) {
    throw new Error(`${label} description contains "etc.": ${desc}`);
  }
}

test("audited closed-value parameter descriptions contain no open-ended suffixes", async () => {
  const prev = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";
  try {
    const tools = await registered();

    const impact = tools.find((t) => t.name === "impact");
    const resolveEdge = tools.find((t) => t.name === "resolve_edge");
    const deleteEdge = tools.find((t) => t.name === "delete_edge");
    const deadCode = tools.find((t) => t.name === "dead_code");
    if (!impact || !resolveEdge || !deleteEdge || !deadCode) {
      throw new Error("one or more audited tools not registered");
    }

    check(impact.parameters.properties.changeType.description, "impact.changeType");
    check(resolveEdge.parameters.properties.kind.description, "resolve_edge.kind");
    check(deleteEdge.parameters.properties.kind.description, "delete_edge.kind");
    check(deadCode.parameters.properties.kind.description, "dead_code.kind");
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
});
```

**Step 2 — Run test, verify it fails (sanity check ordering)**

Run: `bun test test/closed-enum-no-open-suffix.test.ts`

Expected: PASS after Tasks 1–4 (those removed `"..."` and `etc.` already). If run in isolation before Tasks 1–4, it would fail with e.g. `impact.changeType description contains "..."`. Since this task depends on 1–4, add the file here as a lock-in — the runner will print `1 pass` immediately.

If the test fails, revisit Tasks 1–4 to ensure the new descriptions are the exact strings specified (no stray `"..."` or `etc.`).

**Step 3 — Write minimal implementation**

No production code change is required — Tasks 1–4 already removed the suffixes. This task is a lock-in regression test only.

**Step 4 — Run test, verify it passes**

Run: `bun test test/closed-enum-no-open-suffix.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
