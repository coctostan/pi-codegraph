---
id: 2
title: Add deterministic suggestions for invalid parse and validation errors
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/tool-graph-query-invalid-suggestion.test.ts
---

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
