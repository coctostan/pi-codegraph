---
id: 6
title: Execute node-only graph queries end to end
status: approved
depends_on:
  - 1
  - 2
  - 3
  - 4
  - 5
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/graph-query.ts
  - test/tool-graph-query-node.test.ts
---

### Task 6: Execute node-only graph queries end to end [depends: 1, 2, 3, 4, 5]

**Covers AC:** 18, 41

**Files:**
- Create: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-node.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery executes a node-only query and renders anchored results", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-node-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function hello() { return 'world'; }\n";
  writeFileSync(join(projectRoot, "src/hello.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/hello.ts::hello:1",
      kind: "function",
      name: "hello",
      file: "src/hello.ts",
      start_line: 1,
      end_line: 1,
      content_hash: require("../src/indexer/tree-sitter.js").sha256Hex(content),
    });

    const output = graphQuery({
      query: 'MATCH (a {name: "hello"}) RETURN a',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/hello.ts:1:");
    expect(output).toContain("hello");
    expect(output).toContain("function");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-node.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query.ts`
```ts
import type { GraphStore } from "../graph/store.js";
import { compileGraphQuery } from "./graph-query-compiler.js";
import { GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
import { renderGraphQueryRows } from "./graph-query-render.js";

export interface GraphQueryParams {
  query: string;
  store: GraphStore;
  projectRoot: string;
}

export function graphQuery(params: GraphQueryParams): string {
  try {
    const ast = parseGraphQuery(params.query);
    const compiled = compileGraphQuery(ast);
    const rows = params.store.queryRows<Record<string, unknown>>(compiled.sql, compiled.params);
    return renderGraphQueryRows(rows, compiled.columns, params.projectRoot);
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return `${error.kind}: ${error.message}\n`;
    }
    throw error;
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-node.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
