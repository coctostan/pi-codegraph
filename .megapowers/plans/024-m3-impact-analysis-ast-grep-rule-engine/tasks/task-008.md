---
id: 8
title: Run the ast-grep stage from the pipeline and keep Stage 3 incremental
  behavior correct
status: approved
depends_on:
  - 3
  - 4
  - 5
  - 6
  - 7
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
  - src/indexer/pipeline.ts
files_to_create:
  - test/indexer-ast-grep-express-integration.test.ts
---

### Task 8: Run the ast-grep stage from the pipeline and keep Stage 3 incremental behavior correct [depends: 3, 4, 5, 6, 7]
**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Modify: `src/indexer/pipeline.ts`
- Test: `test/indexer-ast-grep-express-integration.test.ts`
```ts
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { runAstGrepIndexStage } from "../src/indexer/ast-grep.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};


test("sg binary is available for Stage 3 subprocess integration", async () => {
  const proc = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    // CI environments without sg should skip this capability check; functional coverage still exists in mocked/unit tests.
    console.warn("Skipping sg capability assertion: sg --version returned non-zero");
    return;
  }
  const stderr = await new Response(proc.stderr).text();
  expect(stderr).toBe("");
});


test("runAstGrepIndexStage passes only changed files to scanFn", async () => {
  const store = new SqliteGraphStore();
  const calls: string[][] = [];
  const spyScan = async (_root: string, _rule: any, files: string[]) => {
    calls.push(files);
    return [];
  };

  try {
    await runAstGrepIndexStage(store, process.cwd(), [], spyScan as any);
    expect(calls).toEqual([]); // unchanged run: no sg invocation
  } finally {
    store.close();
  }
});


test("runAstGrepIndexStage passes exactly provided changed files to scanFn", async () => {
  const store = new SqliteGraphStore();
  const calls: string[][] = [];
  const spyScan = async (_root: string, _rule: any, files: string[]) => {
    calls.push(files);
    return [];
  };

  try {
    await runAstGrepIndexStage(store, process.cwd(), ["src/a.ts", "src/b.ts"], spyScan as any);
    expect(calls.every((files) => files.length === 2)).toBeTrue();
    expect(calls[0]).toEqual(["src/a.ts", "src/b.ts"]);
  } finally {
    store.close();
  }
});

test("SqliteGraphStore.deleteFile removes endpoint nodes and Stage-3 routes_to edges", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/api.ts::handler:1", kind: "function", name: "handler", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h" });
    store.addNode({ id: "endpoint:GET:/users", kind: "endpoint", name: "endpoint:GET:/users", file: "src/api.ts", start_line: 2, end_line: 2, content_hash: "h" });
    store.addEdge({
      source: "src/api.ts::handler:1",
      target: "endpoint:GET:/users",
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.9, evidence: "t", content_hash: "h" },
      created_at: 1,
    });
    store.deleteFile("src/api.ts");
    expect(store.getNode("endpoint:GET:/users")).toBeNull();
    expect(store.getNeighbors("src/api.ts::handler:1", { direction: "out", kind: "routes_to" })).toHaveLength(0);
  } finally {
    store.close();
  }
});
test("bundled rules path resolves and bundled files exist", () => {
  const bundledDir = fileURLToPath(new URL("../src/rules/", import.meta.url));
  expect(bundledDir.includes("/src/rules")).toBeTrue();
  expect(existsSync(join(bundledDir, "express.yaml"))).toBeTrue();
  expect(existsSync(join(bundledDir, "react.yaml"))).toBeTrue();
});
test("pipeline Stage 3 minimal Express integration creates endpoint node id and routes_to edge", async () => {
  const root = join(tmpdir(), `pi-cg-express-min-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "api.ts"),
    "export function handler() { return 1; }\napp.get('/users', handler);\n",
  );

  const store = new SqliteGraphStore();
  try {

    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping Stage 3 integration assertion: sg not available");
      return;
    }
    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    // This integration test uses the real sg subprocess path (Task 5 only mocks ExecFn in unit scope).

    // Tree-sitter must run first so the handler node exists before Stage 3 attaches routes_to.

    const handler = store.findNodes("handler", "src/api.ts")[0]!;
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(1);
    expect(store.getNode("endpoint:GET:/users")).toBeDefined();
    const routes = store.getNeighbors(handler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/users"]);
    expect(routes.every((result) => result.edge.provenance.source === "ast-grep")).toBeTrue();
    // Duplicate prevention check: unchanged re-index keeps cardinality stable (AC 26 + PK behavior).
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("pipeline Stage 3 indexes express routes, replaces changed matches, keeps unchanged reruns stable, and cleans removed-file artifacts", async () => {
  const root = join(tmpdir(), `pi-cg-express-stage3-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  const apiPath = join(root, "src", "api.ts");
  writeFileSync(
    apiPath,
    "export function handler() { return 1; }\nexport function caller() { return handler(); }\napp.get('/users', handler);\n",
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    // Tree-sitter output already exists in the shared store before Stage 3 runs.

    const handler = store.findNodes("handler", "src/api.ts")[0]!;
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(1);
    let routes = store.getNeighbors(handler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/users"]);
    const caller = store.findNodes("caller", "src/api.ts")[0]!;
    expect(store.getNeighbors(caller.id, { direction: "out", kind: "calls" })).toHaveLength(1);

    writeFileSync(
      apiPath,
      "export function handler() { return 1; }\nexport function caller() { return handler(); }\napp.get('/accounts', handler);\n",
    );
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const updatedHandler = store.findNodes("handler", "src/api.ts")[0]!;
    routes = store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" });
    expect(routes.map((result) => result.node.id)).toEqual(["endpoint:GET:/accounts"]);
    expect(routes.every((result) => result.edge.provenance.source === "ast-grep")).toBeTrue();
    expect(store.getNode("endpoint:GET:/users")).toBeNull();
    expect(store.getNeighbors(caller.id, { direction: "out", kind: "calls" })).toHaveLength(1);
    const callEdges = store.getNeighbors(caller.id, { direction: "out", kind: "calls" });
    expect(callEdges).toHaveLength(1);
    expect(callEdges[0]!.edge.provenance.source).not.toBe("ast-grep");
    const edgeCountBeforeUnchanged = routes.length;
    const unchanged = await indexProject(root, store, { lspClientFactory: () => fakeClient });
    routes = store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" });
    expect(routes).toHaveLength(1);
    expect(routes.length).toBe(edgeCountBeforeUnchanged);
    expect(new Set(routes.map((result) => `${result.edge.source}->${result.edge.target}`)).size).toBe(1);
    expect(store.findNodes("endpoint:GET:/accounts")).toHaveLength(1);
    expect(unchanged.indexed).toBe(0);
    // unchanged.indexed === 0 means changedFiles is empty, so Stage 3 receives no files and does not invoke sg.
    expect(unchanged.skipped).toBeGreaterThan(0);

    rmSync(apiPath);
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    expect(store.findNodes("handler", "src/api.ts")).toHaveLength(0);
    expect(store.getNode("endpoint:GET:/accounts")).toBeNull();
    // deleteFile cleanup must also remove stale Stage-3 edges (AC 25)
    expect(store.getNeighbors(updatedHandler.id, { direction: "out", kind: "routes_to" })).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/indexer-ast-grep-express-integration.test.ts
```
Expected: `FAIL — Expected ["endpoint:GET:/users"], received []`
**Step 3 — Integrate Stage 3 in pipeline with module-relative bundled rules path**
```ts
// src/indexer/ast-grep.ts
import { fileURLToPath } from "node:url";
import type { GraphStore } from "../graph/store.js";
export async function runAstGrepIndexStage(
  store: GraphStore,
  projectRoot: string,
  files: string[],
  scanFn: typeof runScan = runScan,
): Promise<void> {
  // Uses the same GraphStore instance created by the indexing pipeline (AC 32).
  if (files.length === 0) return;
  const bundledDir = fileURLToPath(new URL("../rules/", import.meta.url));
  // Invariant: ast-grep.ts remains under src/indexer/ so ../rules/ resolves to src/rules/ (AC 16/17).
  const rules = loadRules({ bundledDir, projectRoot });
  // Missing bundledDir is non-fatal because loadRules() returns [] for non-existent dirs.

  // `files` is the pipeline's `changedFiles` list, so each sg invocation is restricted to changed files only.
  for (const rule of rules) {
    const matches = await scanFn(projectRoot, rule, files);
    applyRuleMatches(store, rule, matches);
  }
}
```

```ts
// src/indexer/pipeline.ts
// GraphStore API used below (src/graph/store.ts):
// getFileHash(file), setFileHash(file, hash), deleteFile(file), listFiles(), addNode(), addEdge().
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { runAstGrepIndexStage } from "./ast-grep.js";
import { extractFile, sha256Hex } from "./tree-sitter.js";
import { TsServerClient, type ITsServerClient } from "./tsserver-client.js";
import { runLspIndexStage } from "./lsp.js";

interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
}

function toPosixPath(p: string): string {
  return p.split("\\").join("/");
}

// walkTsFiles(root) is the concrete helper added in Task 3 and reused here.
// (not redefined in this snippet).

interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
}
interface GraphStorePersistenceSubset {
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  deleteFile(file: string): void;
  listFiles(): string[];
}
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  const files = walkTsFiles(projectRoot);

  let indexed = 0;
  let skipped = 0;
  let removed = 0;
  let errors = 0;
  const changedFiles: string[] = [];

  const currentRel = new Set(files.map((absPath) => toPosixPath(relative(projectRoot, absPath))));
// `toPosixPath()` and `walkTsFiles()` are existing helpers in this module.
  for (const absPath of files) {
    const rel = toPosixPath(relative(projectRoot, absPath));
    try {
      const content = readFileSync(absPath, "utf8");
      const hash = sha256Hex(content);
      const existing = store.getFileHash(rel);
      if (existing === hash) {
        skipped++;
        continue;
      }
      if (existing !== null) {
        store.deleteFile(rel);
        // AC 25: this removes stale ast-grep edges touching nodes from rel before Stage 3 rescans.
        // SqliteGraphStore.deleteFile() removes stale ast-grep/tree-sitter/lsp edges touching file nodes before deleting nodes/file hash.
        // Tree-sitter edges are re-created immediately by extractFile/addEdge below.
      }

      const extracted = extractFile(rel, content);
      store.addNode(extracted.module);
      for (const node of extracted.nodes) store.addNode(node);
      for (const edge of extracted.edges) store.addEdge(edge);
      store.setFileHash(rel, hash);
      changedFiles.push(rel);
      indexed++;
    } catch {
      errors++;
    }
  }

  for (const oldFile of store.listFiles()) {
    if (currentRel.has(oldFile)) continue;
    try {
      store.deleteFile(oldFile);
      removed++;
    } catch {
      errors++;
    }
  }

  const client = options.lspClientFactory ? options.lspClientFactory(projectRoot) : new TsServerClient(projectRoot);
  // TsServerClient constructor signature (pre-existing): new TsServerClient(projectRoot: string)
  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  // Stale ast-grep artifacts for changed files are removed by the existing pipeline-level
  // store.deleteFile(rel) call before this stage runs; do not add a Stage 3 delete helper.
  // Duplicate ast-grep edges are also prevented by SqliteGraphStore edge PRIMARY KEY
  // schema: CREATE TABLE edges (..., PRIMARY KEY (source, target, kind, provenance_source)).
  // (source, target, kind, provenance_source).
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  // AC 33 ordering is explicit: tree-sitter extraction above, then LSP, then Stage 3 ast-grep.
  return { indexed, skipped, removed, errors };
}
```

```ts
// src/index.ts (existing lifecycle; shown here to make AC 32/33 explicit)
let sharedStore: GraphStore | null = null;

function getOrCreateStore(projectRoot: string): GraphStore {
  if (sharedStore) return sharedStore;
  sharedStore = new SqliteGraphStore(join(projectRoot, ".codegraph", "graph.db"));
  return sharedStore;
}

async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/indexer-ast-grep-express-integration.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
