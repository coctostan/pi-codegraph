---
id: 5
title: Run the LSP stage from the indexing pipeline and purge stale LSP edges on
  file changes
status: approved
depends_on:
  - 3
  - 4
no_test: false
files_to_modify:
  - src/indexer/pipeline.ts
  - src/index.ts
  - test/indexer-index-project.test.ts
files_to_create: []
---

### Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes [depends: 3, 4]
- Modify: `src/indexer/pipeline.ts`
- Modify: `src/index.ts`
- Modify: `test/indexer-index-project.test.ts`
Make `indexProject` async, run the LSP stage after tree-sitter indexing, and update existing tests to await the async API everywhere.

---

#### Step 1 — Test (RED)

Update `test/indexer-index-project.test.ts`.

1) Convert all synchronous `indexProject(...)` assertions to async forms.

Replace:

```typescript
const result = indexProject(root, store);
expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
```

with:

```typescript
const result = await indexProject(root, store);
expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
```

Replace:

```typescript
expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
```

with:

```typescript
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
```

Apply this throughout the file (all three existing tests).

2) Append this integration test proving the LSP stage runs after tree-sitter and upgrades an unresolved call edge:

```typescript
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

test("indexProject runs LSP stage and upgrades unresolved call edge to lsp provenance", async () => {
  const root = join(tmpdir(), `pi-codegraph-lsp-stage-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "api.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(root, "src", "impl.ts"), 'import { shared } from "./api";\nexport function run(){ shared(); }\n');
  const store = new SqliteGraphStore(dbPath);
  try {
    const fakeClient: ITsServerClient = {
      async definition(file, line, col) {
        if (file === "src/impl.ts" && line === 2 && col === 24) {
          return { file: "src/api.ts", line: 1, col: 17 };
        }
        return null;
      },
      async references() { return []; },
      async implementations() { return []; },
      async shutdown() {},
    };

    const result = await indexProject(root, store, {
      lspClientFactory: () => fakeClient,
    });

    expect(result.errors).toBe(0);

    const runNode = store.findNodes("run", "src/impl.ts")[0]!;
    const out = store.getEdgesBySource(runNode.id);
    expect(out.some((e) => e.kind === "calls" && e.provenance.source === "lsp")).toBe(true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/indexer-index-project.test.ts
```

Expected failure before implementation:

```text
TS2345: Argument of type 'IndexResult' is not assignable to parameter of type 'Promise<unknown>'
```

and for the new test hook:

```text
TS2554: Expected 2 arguments, but got 3.
```

---

#### Step 3 — Implementation

1) Modify `src/indexer/pipeline.ts`.

- Change signature to async and accept optional LSP factory:

```typescript
import { runLspIndexStage } from "./lsp.js";
import { TsServerClient } from "./tsserver-client.js";
import type { ITsServerClient } from "./tsserver-client.js";

export interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
}
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  // existing tree-sitter indexing logic unchanged
  // ...

  const client = options.lspClientFactory
    ? options.lspClientFactory(projectRoot)
    : new TsServerClient(projectRoot);

  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  return { indexed, skipped, removed, errors };
}
```

2) Modify `src/index.ts` to await indexing and to use Task-1 constructor API:

```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}
```

And in both tool handlers:

```typescript
await ensureIndexed(projectRoot, store);
```

3) Update all existing tests in `test/indexer-index-project.test.ts`:
- change each test callback to `async`
- change every `indexProject(...)` assertion to `await`/`resolves` form.

---

#### Step 4 — Run (PASS)

```bash
bun test test/indexer-index-project.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.
