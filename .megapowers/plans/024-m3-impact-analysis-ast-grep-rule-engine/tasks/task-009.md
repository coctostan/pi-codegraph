---
id: 9
title: Index React renders from a real TSX fixture
status: approved
depends_on:
  - 3
  - 7
  - 8
no_test: false
files_to_modify: []
files_to_create:
  - test/indexer-ast-grep-react-integration.test.ts
---

### Task 9: Index React renders from a real TSX fixture [depends: 3, 7, 8]
**Files:**
- Test: `test/indexer-ast-grep-react-integration.test.ts`
Scope note: AC 30 is satisfied with React render extraction. For this milestone we intentionally keep same-file target lookup to preserve AC 24/26 incremental correctness; cross-file invalidation expansion is out-of-scope.
**Step 1 — Write the failing integration test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};
test("pipeline Stage 3 indexes same-file renders edges from TSX fixture", async () => {
  const root = join(tmpdir(), `pi-cg-react-stage3-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });
  writeFileSync(join(root, "src", "App.tsx"), `export function Button() { return <button/>; }
export function App() {
  return <Button />;
}
`);
  writeFileSync(join(root, "src", "components", "Button.tsx"), `export function Button() {
  return <button>external</button>;
}
`);
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping React Stage 3 integration: sg not available");
      return;
    }

    const app = store.findNodes("App", "src/App.tsx")[0]!;
    const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
    expect(renders).toHaveLength(1);
    expect(renders[0]!.node.name).toBe("Button");
    expect(renders[0]!.node.file).toBe("src/App.tsx");
    expect(renders.some((r) => r.node.file === "src/components/Button.tsx")).toBeFalse();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});


test("same-file-only lookup excludes cross-file target when local target is absent", async () => {
  const root = join(tmpdir(), `pi-cg-react-stage3-miss-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });

  writeFileSync(join(root, "src", "App.tsx"), `export function App() { return <Button />; }\n`);
  writeFileSync(join(root, "src", "components", "Button.tsx"), `export function Button() { return <button/>; }\n`);

  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const sgCheck2 = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck2.exited) !== 0) {
      console.warn("Skipping React Stage 3 integration: sg not available");
      return;
    }
    const app = store.findNodes("App", "src/App.tsx")[0]!;
    const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
    expect(renders).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 - Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-react-integration.test.ts
```
Expected: `FAIL — test file not found` (Step 1 has not yet been written to disk). Once written, if Tasks 3, 7, and 8 are already complete and `sg` is installed, the test may be GREEN immediately — that is expected. Step 3 has no new implementation to add; proceed to Step 4.

**Step 3 — Rely on same-file lookup from Task 7 (no cross-file fallback)**
```ts
// src/indexer/ast-grep.ts inside applyRendersMatches()
const targetNode = store.findNodes(targetName, match.file)[0];
if (!targetNode) continue;
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-react-integration.test.ts
```
Expected: PASS
**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
