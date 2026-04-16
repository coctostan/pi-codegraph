---
id: 3
title: Gate `_meta` on `CODEGRAPH_DEVMETA`
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/tools/token-tracker.ts
  - src/index.ts
files_to_create:
  - test/extension-readonly-devmeta.test.ts
---

### Task 3: Gate `_meta` on `CODEGRAPH_DEVMETA` [depends: 2]

**Files:**
- Modify: `src/tools/token-tracker.ts`
- Modify: `src/index.ts`
- Test: `test/extension-readonly-devmeta.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-readonly-devmeta.test.ts` with this exact content:

```ts
import { test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

function createProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-devmeta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 1; }\nexport function foo() { return bar(); }\n",
  );
  return projectRoot;
}

function registerTools() {
  const tools: Array<{ name: string; execute: Function }> = [];
  const mockPi = {
    registerTool(tool: { name: string; execute: Function }) {
      tools.push(tool);
    },
    on() {},
  };

  resetStoreForTesting();
  piCodegraph(mockPi as any);
  return tools;
}

test("CODEGRAPH_DEVMETA gates _meta per call without restart", async () => {
  const projectRoot = createProject();
  const previous = process.env.CODEGRAPH_DEVMETA;
  const tools = registerTools();
  const symbolGraphTool = tools.find((tool) => tool.name === "symbol_graph");
  if (!symbolGraphTool) throw new Error("symbol_graph tool was not registered");

  try {
    delete process.env.CODEGRAPH_DEVMETA;
    const offResult = await symbolGraphTool.execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const offText = (offResult.content[0] as any).text as string;
    if (offText.includes("_meta:")) {
      throw new Error("read-only output rendered _meta without CODEGRAPH_DEVMETA");
    }

    process.env.CODEGRAPH_DEVMETA = "1";
    const onResult = await symbolGraphTool.execute(
      "call-2",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const onText = (onResult.content[0] as any).text as string;
    if (!onText.includes("_meta:")) {
      throw new Error("read-only output did not render _meta when CODEGRAPH_DEVMETA=1");
    }

    delete process.env.CODEGRAPH_DEVMETA;
    const toggledOffResult = await symbolGraphTool.execute(
      "call-3",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const toggledOffText = (toggledOffResult.content[0] as any).text as string;
    if (toggledOffText.includes("_meta:")) {
      throw new Error("read-only output cached CODEGRAPH_DEVMETA across calls");
    }
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMETA;
    else process.env.CODEGRAPH_DEVMETA = previous;
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-readonly-devmeta.test.ts`
Expected: FAIL — `Error: read-only output rendered _meta without CODEGRAPH_DEVMETA`

**Step 3 — Write minimal implementation**
In `src/tools/token-tracker.ts`, add the per-call env helper and the gated wrapper exactly like this:

```ts
export function devMetaEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.CODEGRAPH_DEVMETA?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function appendTokenMetaIfEnabled(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  if (!devMetaEnabled()) return toolOutput;
  return appendTokenMeta(toolName, params, toolOutput, store, projectRoot);
}
```

Then update the import and centralized helper in `src/index.ts`:

```ts
import { appendTokenMetaIfEnabled, resetSession } from "./tools/token-tracker.js";
```

```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-readonly-devmeta.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test && bun run check`
Expected: all passing
