---
id: 11
title: Lock top-level tool descriptions free of inline examples and enumerations
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-descriptions-style-guard.test.ts
---

Covers AC 21 (style-guide compliance from `docs/tool-descriptions.md`) and provides ancillary coverage for AC 19 and AC 20 (registration surface gating by `CODEGRAPH_DEVMODE`).

**Files:**
- Create: `test/tool-descriptions-style-guard.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-descriptions-style-guard.test.ts`:

```ts
import { test } from "bun:test";

async function registeredWith(devMode: boolean) {
  const prev = process.env.CODEGRAPH_DEVMODE;
  if (devMode) process.env.CODEGRAPH_DEVMODE = "1";
  else delete process.env.CODEGRAPH_DEVMODE;
  try {
    const tools: Array<{ name: string; description: string }> = [];
    const mockPi = {
      registerTool(tool: { name: string; description: string }) {
        tools.push({ name: tool.name, description: tool.description });
      },
      on() {},
    };
    const mod = await import("../src/index.js");
    if (typeof (mod as any).resetStoreForTesting === "function") (mod as any).resetStoreForTesting();
    (mod as any).default(mockPi as any);
    return tools;
  } finally {
    if (prev === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = prev;
  }
}

test("registration surface gated on CODEGRAPH_DEVMODE", async () => {
  const def = (await registeredWith(false)).map((t) => t.name).sort();
  const expectedDefault = ["delete_edge", "impact", "resolve_edge", "symbol_graph", "trace"];
  if (JSON.stringify(def) !== JSON.stringify(expectedDefault)) {
    throw new Error(`default surface drifted: ${JSON.stringify(def)}`);
  }

  const dev = (await registeredWith(true)).map((t) => t.name).sort();
  const expectedDev = [
    "dead_code",
    "delete_edge",
    "graph_overview",
    "graph_query",
    "impact",
    "resolve_edge",
    "symbol_graph",
    "trace",
  ];
  if (JSON.stringify(dev) !== JSON.stringify(expectedDev)) {
    throw new Error(`dev surface drifted: ${JSON.stringify(dev)}`);
  }
});

test("audited tool top-level descriptions contain no inline examples or enumerations", async () => {
  const tools = await registeredWith(true);
  const audited = new Set(["impact", "resolve_edge", "delete_edge", "dead_code"]);
  for (const t of tools) {
    if (!audited.has(t.name)) continue;
    const d = t.description;
    // No enumerated-literal phrasing in the top-level description (those belong in parameter description).
    if (/Allowed values:/.test(d)) {
      throw new Error(`${t.name} top-level description contains "Allowed values:" — move to parameter description: ${d}`);
    }
    // No inline code-example markers.
    if (d.includes("```") || /\bexample:/i.test(d)) {
      throw new Error(`${t.name} top-level description contains an inline example: ${d}`);
    }
  }
});
```

**Step 2 — Run test, verify it fails (or passes as a lock-in)**

Run: `bun test test/tool-descriptions-style-guard.test.ts`

Expected: PASS — Tasks 1–4 only modify parameter descriptions, never the top-level tool descriptions, so both assertions already hold. If the runner reports e.g. `impact top-level description contains "Allowed values:"`, it means a prior task accidentally leaked the enumeration into the top-level description — fix by moving the `Allowed values:` text back into the parameter schema's description field only.

**Step 3 — Write minimal implementation**

No production code change expected. This task exists as a lock-in so future edits don't silently violate `docs/tool-descriptions.md`.

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-descriptions-style-guard.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`

Expected: all passing, type-check clean.
