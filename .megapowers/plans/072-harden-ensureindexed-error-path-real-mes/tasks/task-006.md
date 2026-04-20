---
id: 6
title: "RC-A accounting: per-stage write errors bump IndexResult.errors"
status: approved
depends_on:
  - 5
no_test: false
files_to_modify:
  - src/indexer/lsp.ts
  - src/indexer/git.ts
  - src/indexer/ast-grep.ts
  - src/indexer/pipeline.ts
files_to_create:
  - test/pipeline-stage-error-accounting.test.ts
---

Currently `IndexResult.errors` only reflects tree-sitter + `deleteFile`
failures. After Tasks 2–5 swallow write failures in async stages, callers
lose the signal that indexing was partial. Thread a per-stage error counter
through the pipeline so the catch-and-continue blocks increment `errors`.

**Files:**
- Modify: `src/indexer/lsp.ts`
- Modify: `src/indexer/git.ts`
- Modify: `src/indexer/ast-grep.ts`
- Modify: `src/indexer/pipeline.ts`
- Create: `test/pipeline-stage-error-accounting.test.ts`

**Step 1 — Write the failing test**

Current contract (from `read` on `src/indexer/pipeline.ts`):
```ts
export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  errors: number;
  timings: Record<string, number>;
}
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult>
```

Create `test/pipeline-stage-error-accounting.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { GraphEdge } from "../src/graph/types.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

describe("RC-A accounting: stage write failures bump result.errors", () => {
  test("LSP stage write failure increments errors, does not abort pipeline", async () => {
    const dir = join(tmpdir(), `pi-cg-pipeline-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src/hello.ts"),
      "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
    );
    try {
      const store = new SqliteGraphStore(join(dir, "graph.db"));
      const fakeClient: ITsServerClient = {
        async definition(_f, _line, _col) {
          return { file: "src/hello.ts", line: 1, col: 1 };
        },
        async references() { return []; },
        async implementations() { return []; },
        async shutdown() {},
      };

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let lspWrites = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.provenance.source === "lsp") {
          lspWrites++;
          throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      let result;
      try {
        result = await indexProject(dir, store, { lspClientFactory: () => fakeClient });
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      // All planned LSP writes were attempted (stage did not abort on first throw).
      expect(lspWrites).toBeGreaterThanOrEqual(1);
      // Pipeline completed and returned a result.
      expect(result).toBeDefined();
      // Every failed guarded write bumps errors.
      expect(result.errors).toBeGreaterThanOrEqual(lspWrites);

      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/pipeline-stage-error-accounting.test.ts`

Expected: FAIL —
```
error: expect(received).toBeGreaterThanOrEqual(expected)
Expected: >= 1
Received: 0
```
The guarded catch blocks added in Tasks 2–5 currently swallow the error
silently and `result.errors` stays at 0.

**Step 3 — Write minimal implementation**

Add an `errors` counter to each stage's public signature as an optional
`out` parameter, and return it.

Change 1 — `src/indexer/lsp.ts`: change `runLspIndexStage` return type from
`Promise<void>` to `Promise<number>` (error count). Increment in each
catch block.

Before (abbreviated):
```ts
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  /* ... loop with guarded writes from Tasks 2 + 3 ... */
}
```
After:
```ts
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<number> {
  let errors = 0;
  /* ... same loop; replace `} catch { /* ... */ }` blocks with
     `} catch { errors++; }` ... */
  return errors;
}
```

Both catch blocks added in Tasks 2 and 3 change from empty body to
`errors++;`.

Change 2 — `src/indexer/git.ts`: change `runGitCoChangeStage` return type
from `Promise<void>` to `Promise<number>`. Initialize `let errors = 0`
before the early-return branch. Replace each of the four catch blocks from
Task 4 with `errors++;`. Return `errors` from both `return` statements (add
`return errors;` where there's currently a bare `return;`).

Specifically (`src/indexer/git.ts`, signature line 75-79):
```ts
export async function runGitCoChangeStage(
  store: GraphStore,
  projectRoot: string,
  options: GitCoChangeOptions = {},
): Promise<number> {
  let errors = 0;
  const head = getCurrentHead(projectRoot);
  if (!head) return errors;

  const lastHead = store.getFileHash(GIT_HEAD_KEY);
  if (lastHead === head) return errors;

  /* ... rest of body ... */
  try { store.setFileHash(GIT_HEAD_KEY, head); } catch { errors++; }
  return errors;
}
```

The early-return for `commits.length === 0` also becomes:
```ts
  if (commits.length === 0) {
    try { store.setFileHash(GIT_HEAD_KEY, head); } catch { errors++; }
    return errors;
  }
```

Change 3 — `src/indexer/ast-grep.ts`: both `applyRoutesToMatches` and
`applyRendersMatches` return `number`. `applyRuleMatches` returns `number`.
`runAstGrepIndexStage` returns `Promise<number>`.

```ts
function applyRoutesToMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): number {
  let errors = 0;
  /* ... existing loop; change each catch block added in Task 5 from empty to `errors++;` ... */
  return errors;
}

function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): number {
  let errors = 0;
  /* ... existing loop; change each catch block added in Task 5 from empty to `errors++;` ... */
  return errors;
}

export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): number {
  if (rule.produces.edge_kind === "routes_to") return applyRoutesToMatches(store, rule, matches);
  if (rule.produces.edge_kind === "renders") return applyRendersMatches(store, rule, matches);
  return 0;
}

export async function runAstGrepIndexStage(
  store: GraphStore,
  projectRoot: string,
  files: string[],
  scanFn: typeof runScan = runScan,
): Promise<number> {
  let errors = 0;
  if (files.length === 0) return errors;
  const bundledDir = fileURLToPath(new URL("../rules/", import.meta.url));
  const rules = loadRules({ bundledDir, projectRoot });
  for (const rule of rules) {
    const matches = await scanFn(projectRoot, rule, files);
    errors += applyRuleMatches(store, rule, matches);
  }
  return errors;
}
```

Change 4 — `src/indexer/pipeline.ts`: fold the returned counters into the
outer `errors` total. Edit lines 109-126:

Before:
```ts
  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);

  const astGrepStart = performance.now();
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - astGrepStart);

  const coverageStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - coverageStart);

  const gitStart = performance.now();
  await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);
```
After:
```ts
  try {
    errors += await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  timings["lsp"] = Math.round(performance.now() - lspStart);

  const astGrepStart = performance.now();
  errors += await runAstGrepIndexStage(store, projectRoot, changedFiles);
  timings["ast-grep"] = Math.round(performance.now() - astGrepStart);

  const coverageStart = performance.now();
  runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
  timings["coverage"] = Math.round(performance.now() - coverageStart);

  const gitStart = performance.now();
  errors += await runGitCoChangeStage(store, projectRoot);
  timings["git"] = Math.round(performance.now() - gitStart);
```

No changes to `runCoverageIndexStage` (it already has no unguarded
mutations introduced by this batch; leave its void return as-is).

No changes needed to `IndexResult` — the existing `errors: number` field is
the accumulator.

**Step 4 — Run test, verify it passes**

Run: `bun test test/pipeline-stage-error-accounting.test.ts`

Expected: PASS — `result.errors >= lspWrites`.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing. In particular:
- Tests 2–5 still pass (they never read the returned count).
- `test/readonly-graceful-degradation.test.ts` still passes — a real
  readonly DB makes every guarded `store.addEdge` throw → `errors > 0` →
  `ensureIndexed` sets `lastIndexError = new Error("readonly database")`
  at `src/index.ts:104-105` (unchanged logic).
