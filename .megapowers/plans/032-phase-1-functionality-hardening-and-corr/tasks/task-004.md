---
id: 4
title: Accept single-quoted WHERE string literals in graph_query
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/tool-graph-query-single-quote-where.test.ts
---

### Task 4: Accept single-quoted WHERE string literals in graph_query

**Files:**
- Create: `test/tool-graph-query-single-quote-where.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/tool-graph-query-single-quote-where.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery accepts a single-quoted equality predicate in WHERE", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-single-quote-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const graphStoreContent = "export interface GraphStore {}\n";
  writeFileSync(join(projectRoot, "src", "graph-store.ts"), graphStoreContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/graph-store.ts::GraphStore:1",
      kind: "interface",
      name: "GraphStore",
      file: "src/graph-store.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(graphStoreContent),
    });

    const output = graphQuery({
      query: "MATCH (n) WHERE n.name = 'GraphStore' RETURN n.name",
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("n.name: GraphStore");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-single-quote-where.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because the current parser returns `parse_error: invalid WHERE predicate: n.name = 'GraphStore'`.

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, replace `parseWhere()` with:

```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];

  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError("unsupported_error", "OR is not supported");
  }

  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece
      .trim()
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]+)"|'([^']+)')$/);
    if (!match) throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    return {
      alias: match[1]!,
      property: match[2]!,
      value: match[3] ?? match[4]!,
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-single-quote-where.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
