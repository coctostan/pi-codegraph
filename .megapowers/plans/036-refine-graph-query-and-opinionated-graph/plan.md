# Plan

### Task 1: Add deterministic suggestions for unsupported graph_query forms

### Task 1: Add deterministic suggestions for unsupported graph_query forms

**Files:**
- Create: `test/tool-graph-query-unsupported-suggestion.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Modify: `src/tools/graph-query.ts`
- Test: `test/tool-graph-query-unsupported-suggestion.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-graph-query-unsupported-suggestion.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

test("graphQuery returns a deterministic suggestion for unsupported ORDER BY queries", () => {
  const fakeStore = {
    getStatistics() {
      return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
    },
  } as any;

  const output = graphQuery({
    query: 'MATCH (a {name: "foo"}) RETURN a ORDER BY a.name',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain("unsupported_error: ORDER BY is not supported");
  expect(output).toContain('try instead: MATCH (a {name: "foo"}) RETURN a LIMIT 10');
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-unsupported-suggestion.test.ts`
Expected: FAIL — `expect(received).toContain("try instead: MATCH (a {name: \"foo\"}) RETURN a LIMIT 10")`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, replace the `GraphQueryError` class with:
```ts
export class GraphQueryError extends Error {
  constructor(
    public kind: GraphQueryErrorKind,
    message: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = "GraphQueryError";
  }
}

export function formatGraphQueryError(error: GraphQueryError): string {
  let text = `${error.kind}: ${error.message}\n`;
  if (error.suggestion) text += `try instead: ${error.suggestion}\n`;
  return text;
}
```

In `src/tools/graph-query-parser.ts`, replace `rejectUnsupported()` with:
```ts
function rejectUnsupported(query: string): void {
  if (/\bOPTIONAL\s+MATCH\b/i.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "OPTIONAL MATCH is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  if (/\bCOUNT\s*\(/i.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "aggregation is not supported",
      'MATCH (a {kind: "function"}) RETURN a LIMIT 10',
    );
  }
  if (/\bORDER\s+BY\b/i.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "ORDER BY is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  const queryWithoutStrings = query.replace(/"[^"]*"/g, '""');
  if (/\bCREATE\b|\bMERGE\b|\bDELETE\b|\bSET\b/i.test(queryWithoutStrings)) {
    throw new GraphQueryError(
      "unsupported_error",
      "mutating queries are not supported",
      'MATCH (a {name: "foo"}) RETURN a',
    );
  }
  if (/\[\s*\*[^\]]*\]/.test(query)) {
    throw new GraphQueryError(
      "unsupported_error",
      "variable-length paths are not supported",
      'MATCH (a)-[:calls]->(b) RETURN a, b LIMIT 10',
    );
  }
}
```

In `src/tools/graph-query.ts`, change the parser import and error rendering to:
```ts
import { formatGraphQueryError, GraphQueryError, parseGraphQuery } from "./graph-query-parser.js";
```

```ts
  } catch (error) {
    if (error instanceof GraphQueryError) {
      return prependTrustHeader(formatGraphQueryError(error), { stats });
    }
    throw error;
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-unsupported-suggestion.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: Add deterministic suggestions for invalid parse and validation errors [depends: 1]

### Task 2: Add deterministic suggestions for invalid parse and validation errors [depends: 1]

**Files:**
- Create: `test/tool-graph-query-invalid-suggestion.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/tool-graph-query-invalid-suggestion.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-graph-query-invalid-suggestion.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { graphQuery } from "../src/tools/graph-query.js";

const fakeStore = {
  getStatistics() {
    return { nodes: {}, edges: {}, files: { total: 0, stale: 0 } };
  },
} as any;

test("graphQuery suggests a valid WHERE predicate after a parse error", () => {
  const output = graphQuery({
    query: 'MATCH (a) WHERE a.name ~= "foo" RETURN a',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain('parse_error: invalid WHERE predicate: a.name ~= "foo"');
  expect(output).toContain('try instead: MATCH (a) WHERE a.name = "foo" RETURN a');
});

test("graphQuery suggests a supported projection property after a validation error", () => {
  const output = graphQuery({
    query: 'MATCH (a {name: "foo"}) RETURN a.missing',
    store: fakeStore,
    projectRoot: "/tmp/project",
  });

  expect(output).toContain('validation_error: property "missing" is not allowed on alias "a"');
  expect(output).toContain('try instead: RETURN a.name');
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-query-invalid-suggestion.test.ts`
Expected: FAIL — `expect(received).toContain("try instead: MATCH (a) WHERE a.name = \"foo\" RETURN a")`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, replace `parseWhere()` with:
```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError(
      "unsupported_error",
      "OR is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece
      .trim()
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]+)"|'([^']+)')$/);
    if (!match) {
      throw new GraphQueryError(
        "parse_error",
        `invalid WHERE predicate: ${piece.trim()}`,
        'MATCH (a) WHERE a.name = "foo" RETURN a',
      );
    }
    return {
      alias: match[1]!,
      property: match[2]!,
      value: match[3] ?? match[4]!,
    };
  });
}
```

In `src/tools/graph-query-parser.ts`, update the invalid-property branches inside `parseReturns()` to:
```ts
    if (nodeAliases.has(alias) && !NODE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError(
        "validation_error",
        `property "${property}" is not allowed on alias "${alias}"`,
        `RETURN ${alias}.name`,
      );
    }

    if (edgeAliases.has(alias) && !EDGE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError(
        "validation_error",
        `property "${property}" is not allowed on alias "${alias}"`,
        `RETURN ${alias}.kind`,
      );
    }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-query-invalid-suggestion.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: Parse CONTAINS predicates in WHERE clauses [depends: 2]

### Task 3: Parse CONTAINS predicates in WHERE clauses [depends: 2]

**Files:**
- Create: `test/graph-query-parser-contains.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-contains.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-parser-contains.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery preserves CONTAINS predicates in WHERE clauses", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name CONTAINS "Handler" RETURN n.name LIMIT 2',
  );

  expect(ast.where).toEqual([
    { alias: "n", property: "name", operator: "CONTAINS", value: "Handler" },
  ]);
  expect(ast.limit).toBe(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-contains.test.ts`
Expected: FAIL — `parse_error: invalid WHERE predicate: n.name CONTAINS "Handler"`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, change `WhereClause` to:
```ts
export interface WhereClause {
  alias: string;
  property: string;
  operator?: "CONTAINS";
  value: string;
}
```

Then replace `parseWhere()` with:
```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError(
      "unsupported_error",
      "OR is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece
      .trim()
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(=|CONTAINS)\s*(?:"([^"]*)"|'([^']*)')$/i);
    if (!match) {
      throw new GraphQueryError(
        "parse_error",
        `invalid WHERE predicate: ${piece.trim()}`,
        'MATCH (a) WHERE a.name = "foo" RETURN a',
      );
    }

    const rawOperator = match[3]!.toUpperCase();
    return {
      alias: match[1]!,
      property: match[2]!,
      operator: rawOperator === "CONTAINS" ? "CONTAINS" : undefined,
      value: match[4] ?? match[5] ?? "",
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-contains.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Compile CONTAINS predicates to parameterized SQL [depends: 3]

### Task 4: Compile CONTAINS predicates to parameterized SQL [depends: 3]

**Files:**
- Create: `test/graph-query-compiler-contains.test.ts`
- Modify: `src/tools/graph-query-compiler.ts`
- Test: `test/graph-query-compiler-contains.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-compiler-contains.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits parameterized LIKE SQL for CONTAINS predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name CONTAINS "Handler" RETURN n.name LIMIT 2',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("n0.name LIKE ?");
  expect(compiled.sql).not.toContain("Handler");
  expect(compiled.params).toEqual(["%Handler%", 2]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-compiler-contains.test.ts`
Expected: FAIL — `expect(received).toContain("n0.name LIKE ?")`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-compiler.ts`, replace the `for (const predicate of ast.where)` loop with:
```ts
  for (const predicate of ast.where) {
    const tableAlias = nodeAliases[predicate.alias]!;
    if (predicate.operator === "CONTAINS") {
      wheres.push(`${tableAlias}.${predicate.property} LIKE ?`);
      params.push(`%${predicate.value}%`);
      continue;
    }
    wheres.push(`${tableAlias}.${predicate.property} = ?`);
    params.push(predicate.value);
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-compiler-contains.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Parse STARTS WITH predicates in WHERE clauses [depends: 3]

### Task 5: Parse STARTS WITH predicates in WHERE clauses [depends: 3]

**Files:**
- Create: `test/graph-query-parser-starts-with.test.ts`
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-starts-with.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-parser-starts-with.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery preserves STARTS WITH predicates in WHERE clauses", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name STARTS WITH "get" RETURN n.name LIMIT 4',
  );

  expect(ast.where).toEqual([
    { alias: "n", property: "name", operator: "STARTS WITH", value: "get" },
  ]);
  expect(ast.limit).toBe(4);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-starts-with.test.ts`
Expected: FAIL — `parse_error: invalid WHERE predicate: n.name STARTS WITH "get"`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-parser.ts`, change `WhereClause` to:
```ts
export interface WhereClause {
  alias: string;
  property: string;
  operator?: "CONTAINS" | "STARTS WITH";
  value: string;
}
```

Then replace `parseWhere()` with:
```ts
function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  if (/\s+OR\s+/i.test(whereClause)) {
    throw new GraphQueryError(
      "unsupported_error",
      "OR is not supported",
      'MATCH (a {name: "foo"}) RETURN a LIMIT 10',
    );
  }
  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece
      .trim()
      .match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*(=|CONTAINS|STARTS WITH)\s*(?:"([^"]*)"|'([^']*)')$/i);
    if (!match) {
      throw new GraphQueryError(
        "parse_error",
        `invalid WHERE predicate: ${piece.trim()}`,
        'MATCH (a) WHERE a.name = "foo" RETURN a',
      );
    }

    const rawOperator = match[3]!.toUpperCase();
    return {
      alias: match[1]!,
      property: match[2]!,
      operator:
        rawOperator === "CONTAINS"
          ? "CONTAINS"
          : rawOperator === "STARTS WITH"
            ? "STARTS WITH"
            : undefined,
      value: match[4] ?? match[5] ?? "",
    };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-starts-with.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Compile STARTS WITH predicates to parameterized SQL [depends: 4, 5]

### Task 6: Compile STARTS WITH predicates to parameterized SQL [depends: 4, 5]

**Files:**
- Create: `test/graph-query-compiler-starts-with.test.ts`
- Modify: `src/tools/graph-query-compiler.ts`
- Test: `test/graph-query-compiler-starts-with.test.ts`

**Step 1 — Write the failing test**
Create `test/graph-query-compiler-starts-with.test.ts` with:
```ts
import { expect, test } from "bun:test";
import { compileGraphQuery } from "../src/tools/graph-query-compiler.js";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("compileGraphQuery emits parameterized LIKE SQL for STARTS WITH predicates", () => {
  const ast = parseGraphQuery(
    'MATCH (n) WHERE n.name STARTS WITH "get" RETURN n.name LIMIT 4',
  );

  const compiled = compileGraphQuery(ast);

  expect(compiled.sql).toContain("n0.name LIKE ?");
  expect(compiled.sql).not.toContain("get");
  expect(compiled.params).toEqual(["get%", 4]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-compiler-starts-with.test.ts`
Expected: FAIL — `expect(received).toEqual(["get%", 4])`

**Step 3 — Write minimal implementation**
In `src/tools/graph-query-compiler.ts`, replace the `for (const predicate of ast.where)` loop with:
```ts
  for (const predicate of ast.where) {
    const tableAlias = nodeAliases[predicate.alias]!;
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
Run: `bun test test/graph-query-compiler-starts-with.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 7: Resolve WHERE predicates against edge aliases [depends: 6]

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

### Task 8: Document working graph_query examples in the extension description

### Task 8: Document working graph_query examples in the extension description

**Files:**
- Create: `test/extension-graph-query-description.test.ts`
- Modify: `src/index.ts`
- Test: `test/extension-graph-query-description.test.ts`

**Step 1 — Write the failing test**
Create `test/extension-graph-query-description.test.ts` with:
```ts
import { expect, test } from "bun:test";

test("pi extension documents working graph_query examples in the tool description", async () => {
  const mod = await import("../src/index.js");
  if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

  const registeredTools: Array<{ name: string; description: string }> = [];
  const mockPi = {
    registerTool(tool: { name: string; description: string }) {
      registeredTools.push(tool);
    },
    on() {},
  };

  mod.default(mockPi as any);

  const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
  expect(tool).toBeDefined();
  expect(tool!.description).toContain('MATCH (a {name: "hello"}) RETURN a');
  expect(tool!.description).toContain('MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5');
  expect(tool!.description).toContain('MATCH (n) WHERE n.name = "GraphStore" RETURN n.name');
  expect(tool!.description).toContain('MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name');
  expect(tool!.description).toContain('MATCH (n {kind: "function"}) RETURN n LIMIT 10');
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: FAIL — `expect(received).toContain("MATCH (a {name: \"hello\"}) RETURN a")`

**Step 3 — Write minimal implementation**
In `src/index.ts`, replace the `graph_query` tool description with:
```ts
    description: [
      "Execute a Cypher subset query against the graph.",
      "Examples:",
      'MATCH (a {name: "hello"}) RETURN a',
      'MATCH (a {name: "foo"})-[r:calls]->(b) RETURN a, r, b LIMIT 5',
      'MATCH (n) WHERE n.name = "GraphStore" RETURN n.name',
      'MATCH (n) WHERE n.name CONTAINS "Graph" RETURN n.name',
      'MATCH (n {kind: "function"}) RETURN n LIMIT 10',
    ].join("\n"),
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-graph-query-description.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
