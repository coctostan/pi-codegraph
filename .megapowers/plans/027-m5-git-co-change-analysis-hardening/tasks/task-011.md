---
id: 11
title: Wire git co-change stage into pipeline as Stage 5
status: approved
depends_on:
  - 8
  - 9
no_test: false
files_to_modify:
  - src/indexer/pipeline.ts
files_to_create:
  - test/indexer-pipeline-git-stage.test.ts
---

**AC:** 6 (pipeline wiring), 14 (timing instrumentation), 15 (summary counts)

**Files:**
- Modify: `src/indexer/pipeline.ts`
- Test: `test/indexer-pipeline-git-stage.test.ts`

**Step 1 — Write the failing test**

Create `test/indexer-pipeline-git-stage.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const noopClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("indexProject runs git co-change stage and returns timings", async () => {
  const root = join(tmpdir(), `pi-codegraph-pipeline-git-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });

  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.email "test@test.com"', { cwd: root, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 1;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c1"', { cwd: root, stdio: "ignore" });

  writeFileSync(join(root, "src", "a.ts"), "export const a = 2;");
  writeFileSync(join(root, "src", "b.ts"), "export const b = 2;");
  execSync("git add .", { cwd: root, stdio: "ignore" });
  execSync('git commit -m "c2"', { cwd: root, stdio: "ignore" });

  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });

    // Result should have timings for all 5 stages
    expect(result.timings).toBeDefined();
    expect(typeof result.timings["tree-sitter"]).toBe("number");
    expect(typeof result.timings["lsp"]).toBe("number");
    expect(typeof result.timings["ast-grep"]).toBe("number");
    expect(typeof result.timings["coverage"]).toBe("number");
    expect(typeof result.timings["git"]).toBe("number");

    // All timings should be non-negative
    for (const [, ms] of Object.entries(result.timings)) {
      expect(ms).toBeGreaterThanOrEqual(0);
    }

    // Summary counts still present
    expect(result.indexed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toBe(0);

    // Git stage should have created co_changes_with edges
    const cochangeEdges = store.queryRows<{ kind: string }>(
      "SELECT kind FROM edges WHERE kind = 'co_changes_with'"
    );
    expect(cochangeEdges.length).toBeGreaterThan(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-pipeline-git-stage.test.ts`
Expected: FAIL — `expect(received).toBeDefined() // Received: undefined` for `result.timings` since the current `indexProject` returns `{ indexed, skipped, removed, errors }` without `timings`.

**Step 3 — Write minimal implementation**

Modify `src/indexer/pipeline.ts`:

1. Update `IndexResult` to include `timings`.
2. Add `performance.now()` timing around each stage.
3. Import and call `runGitCoChangeStage` as Stage 5 after coverage.

```ts
// Update imports:
import { runGitCoChangeStage } from "./git.js";

// Update IndexResult interface:
export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
  timings: Record<string, number>;
}

// In indexProject, wrap each stage with timing:
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  const timings: Record<string, number> = {};

  // Stage 1: tree-sitter
  const tsStart = performance.now();
  const files = walkTsFiles(projectRoot);
  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;
  const changedFiles: string[] = [];

  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));
    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);
      const existing = store.getFileHash(rel);
      if (existing === hash) { skipped++; continue; }
      if (existing !== null) store.deleteFile(rel);
      const extracted = extractFile(rel, content);
      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);
      store.setFileHash(rel, hash);
      changedFiles.push(rel);
      indexed++;
    } catch { errors++; }
  }
  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile) || oldFile.startsWith("__")) continue;
    try { store.deleteFile(oldFile); removed++; } catch { errors++; }
  }
  timings["tree-sitter"] = Math.round(performance.now() - tsStart);

  // Stage 2: LSP
  const lspStart = performance.now();
  const client = options.lspClientFactory ? options.lspClientFactory(projectRoot) : new TsServerClient(projectRoot);
  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);

  // Stage 3: ast-grep
  const agStart = performance.now();
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - agStart);

  // Stage 4: coverage
  const covStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - covStart);

  // Stage 5: git co-change
  const gitStart = performance.now();
  await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);

  return { indexed, skipped, removed, errors, timings };
}
```

Note: The `listFiles()` cleanup loop needs to skip entries starting with `__` to avoid deleting the `__git_cochange_head__` sentinel used by the git stage.

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-pipeline-git-stage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all tests passing. Note: existing tests that check `indexProject` return value with `toEqual({ indexed, skipped, removed, errors })` will need to be updated to also expect the `timings` field, or use `toMatchObject` instead. The implementation task should update those existing assertions.
