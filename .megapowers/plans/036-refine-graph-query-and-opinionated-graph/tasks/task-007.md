---
id: 7
title: Resolve WHERE predicates against edge aliases
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/graph-query-compiler.ts
files_to_create:
  - test/tool-graph-query-edge-where.test.ts
---

### Task 7: Resolve WHERE predicates against edge aliases [depends: 6]

**Files:**
- Create: `test/tool-graph-query-edge-where.test.ts`
- Modify: `src/tools/graph-query-compiler.ts`
- Test: `test/tool-graph-query-edge-where.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-graph-query-edge-where.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";
import { graphQuery } from "../src/tools/graph-query.js";

test("compileGraphQuery uses the edge table alias for edge WHERE predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (a)-[e:calls]->(b) WHERE e.evidence = "ref" RETURN a, b.file LIMIT 1',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("e0.evidence = ?");
  expect(compiled.params).toEqual(["calls", "ref", 1]);
});

test("graphQuery executes WHERE predicates on edge aliases", () => {
  const projectRoot = join(tmpdir(), `pi-cg-gq-edge-where-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() { bar(); }\n";
  const bContent = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(aContent),
    });
    store.addNode({
      id: "src/b.ts::bar:1",
      kind: "function",
      name: "bar",
      file: "src/b.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(bContent),
    });
    store.addEdge({
      source: "src/a.ts::foo:1",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: "ref",
        content_hash: sha256Hex(aContent),
      },
      created_at: 1,
    });

    const output = graphQuery({
      query: 'MATCH (a)-[e:calls]->(b) WHERE e.evidence = "ref" RETURN a, b.file LIMIT 1',
      store,
      projectRoot,
    });

    expect(output).toContain("rows: 1");
    expect(output).toContain("a: src/a.ts:1:");
    expect(output).toContain("b.file: src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-edge-where.test.ts`
Expected: FAIL — `expect(received).toContain("e0.evidence = ?")`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-compiler.ts`, replace the `for (const predicate of ast.where)` loop with:
```ts
  for (const predicate of ast.where) {
    const tableAlias = nodeAliases[predicate.alias] ?? edgeAliases[predicate.alias];
    if (!tableAlias) {
      throw new Error(`unbound alias in compiler: ${predicate.alias}`);
    }
    if (predicate.operator === "CONTAINS") {
      wheres.push(`${tableAlias}.${predicate.property} LIKE ?`);
      params.push(`%${predicate.value}%`);
      continue;
    }
    if (predicate.operator === "STARTS WITH") {
      wheres.push(`${tableAlias}.${predicate.property} LIKE ?`);
      params.push(`${predicate.value}%`);
      continue;
    }
    wheres.push(`${tableAlias}.${predicate.property} = ?`);
    params.push(predicate.value);
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-edge-where.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
