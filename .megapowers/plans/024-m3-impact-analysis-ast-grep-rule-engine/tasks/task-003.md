---
id: 3
title: Index TSX files with the tree-sitter stage
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/indexer/tree-sitter.ts
  - src/indexer/pipeline.ts
files_to_create:
  - test/indexer-tsx.test.ts
---

### Task 3: Index TSX files with the tree-sitter stage
Note: This task only enables TSX parsing prerequisites for Stage 3. AC 23 (`sg` subprocess boundary) is implemented in Task 5 and exercised in Tasks 8–9.
Contract note: `src/indexer/tsserver-client.ts` already exists in the repository and is not created by this task; Step 3 includes its interface excerpt only for clarity.

**Files:**
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `src/indexer/pipeline.ts`
- Test: `test/indexer-tsx.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

test("ITsServerClient contract used by indexProject is explicit", () => {
  const fakeClient: ITsServerClient = {
    async definition() { return null; },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };
  expect(typeof fakeClient.definition).toBe("function");
  expect(typeof fakeClient.references).toBe("function");
  expect(typeof fakeClient.implementations).toBe("function");
  expect(typeof fakeClient.shutdown).toBe("function");
});

test("indexProject indexes TSX function components", async () => {
  const root = join(tmpdir(), `pi-codegraph-tsx-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "App.tsx"),
    "export function App() {\n  return <button>Hello</button>;\n}\n",
  );
  writeFileSync(join(root, "src", "util.ts"), "export function util() { return 1; }\n");

  const store = new SqliteGraphStore();
  const fakeClient: ITsServerClient = {
    async definition() { return null; },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  try {
    const result = await indexProject(root, store, { lspClientFactory: () => fakeClient });
    expect(result.indexed).toBe(2); // proves walkTsFiles includes both .ts and .tsx
    expect(store.findNodes("App", "src/App.tsx")).toHaveLength(1);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-tsx.test.ts`
Expected: FAIL — `Expected 1, Received 0` because `.tsx` files are not walked or parsed yet

**Step 3 — Write minimal implementation**
```ts
// src/indexer/pipeline.ts
function walkTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".megapowers" || ent.name === ".git") continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (ent.isFile() && (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))) out.push(full);
    }
  };
  walk(root);
  return out;
}
// src/indexer/pipeline.ts inside indexProject()
const files = walkTsFiles(projectRoot);
```

```ts
// src/indexer/tsserver-client.ts (pre-existing contract used by tests)
export interface ITsServerClient {
  definition(file: string, line: number, character: number): Promise<unknown | null>;
  references(file: string, line: number, character: number): Promise<Array<{ file: string; line: number; character: number }>>;
  implementations(file: string, line: number, character: number): Promise<Array<{ file: string; line: number; character: number }>>;
  shutdown(): Promise<void>;
}
```

```ts
// src/indexer/tree-sitter.ts
import Parser from "tree-sitter";
import ts from "tree-sitter-typescript";
  const mod = ts as unknown as { typescript: unknown; tsx: unknown };
  if (!mod.typescript || !mod.tsx) {
    throw new Error("tree-sitter-typescript missing typescript/tsx exports");
  }
  return file.endsWith(".tsx") ? mod.tsx : mod.typescript;
  // This uses actual tree-sitter-typescript exports at runtime: mod.tsx / mod.typescript.
}
export function extractFile(file: string, content: string): ExtractionResult {
  const parser = new Parser();
  parser.setLanguage(typescriptLanguage(file) as never);
  const tree = parser.parse(content);
  // existing node/edge extraction logic stays unchanged below this parser setup
  // ...
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-tsx.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
