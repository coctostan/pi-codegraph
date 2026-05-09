---
id: 4
title: Initialize hash helper in extension tools
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/extension-hash-init.test.ts
---

Covers AC 3 and AC 4 for public extension tool execution.

**Files:**
- Modify: `src/index.ts`
- Create: `test/extension-hash-init.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-hash-init.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("extension tool execution initializes hashing before rendering anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-extension-hash-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const runnerRoot = join(tmpdir(), `pi-cg-extension-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(runnerRoot, { recursive: true });
  writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() {}\n");

  const emptyBunfig = join(runnerRoot, "bunfig.toml");
  const runner = join(runnerRoot, "runner.ts");
  writeFileSync(emptyBunfig, "[test]\n");
  writeFileSync(
    runner,
    `
import piCodegraph, { resetStoreForTesting } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/index.ts")).href)};
import { expect } from "bun:test";

const tools: any[] = [];
const mockPi = {
  registerTool(tool: any) {
    tools.push(tool);
  },
};

resetStoreForTesting();
piCodegraph(mockPi as any);
const tool = tools.find((candidate) => candidate.name === "symbol_graph");
if (!tool) throw new Error("symbol_graph was not registered");

try {
  const result = await tool.execute(
    "hash-init",
    { name: "foo", file: "src/foo.ts", suppressTrustHeader: true },
    undefined,
    () => {},
    { cwd: ${JSON.stringify(projectRoot)} },
  );
  const text = result.content[0].text as string;
  expect(text).toContain("## foo (function)");
  expect(text).toMatch(/\b1:c27\b/);
  expect(text).not.toContain("Hash not initialized");
} finally {
  resetStoreForTesting();
}
`,
  );

  try {
    const result = spawnSync("bun", ["--config", emptyBunfig, runner], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(result.stderr).not.toContain("Hash not initialized");
    expect(result.status).toBe(0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(runnerRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-hash-init.test.ts`
Expected: FAIL — the child extension runtime exits with `Error: Hash not initialized — call ensureHashInit() first` in stderr because the extension executor reaches `computeAnchor(...)` without first calling `ensureHashInit()`.

**Step 3 — Write minimal implementation**
In `src/index.ts`, import `ensureHashInit`:

```ts
import { ensureHashInit } from "./output/anchoring.js";
```

Then initialize hashing in each public read-only tool executor after indexing and before calling renderers that may synchronously call `computeLineHash(...)` through `computeAnchor(...)`.

For `symbol_graph`:

```ts
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      await ensureHashInit();
      let resolvedNode: any | null = null;
```

For `impact`:

```ts
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      await ensureHashInit();
      const text = impact({
```

For `trace`:

```ts
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      await ensureHashInit();
      const text = trace({ entry: params.entry, file: params.file, store, projectRoot });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-hash-init.test.ts`
Expected: PASS — the extension result text satisfies:

```ts
expect(text).toContain("## foo (function)");
expect(text).toMatch(/\b1:c27\b/);
expect(text).not.toContain("Hash not initialized");
```

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
