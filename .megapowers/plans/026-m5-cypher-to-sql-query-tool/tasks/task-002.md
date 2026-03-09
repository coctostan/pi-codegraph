---
id: 2
title: Parse supported Cypher subset into AST
status: approved
depends_on:
  - 1
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/graph-query-parser.ts
  - test/graph-query-parser.test.ts
---

### Task 2: Parse supported Cypher subset into AST [depends: 1]

**Covers AC:** 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 35

**Files:**
- Create: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery parses one MATCH chain with filters, WHERE, RETURN projections, and LIMIT", () => {
  const ast = parseGraphQuery(
    'MATCH (a {kind: "function", name: "foo"})-[r:calls]->(b {kind: "function"}) WHERE a.name = "foo" AND b.name = "bar" RETURN a, r, b.file LIMIT 5',
  );

  expect(ast.match.left.alias).toBe("a");
  expect(ast.match.left.filters).toEqual({ kind: "function", name: "foo" });
  expect(ast.match.edge).toEqual({ alias: "r", kind: "calls", direction: "out" });
  expect(ast.match.right).toEqual({ alias: "b", filters: { kind: "function" } });
  expect(ast.where).toEqual([
    { alias: "a", property: "name", value: "foo" },
    { alias: "b", property: "name", value: "bar" },
  ]);
  expect(ast.returns).toEqual([
    { kind: "alias", alias: "a" },
    { kind: "alias", alias: "r" },
    { kind: "property", alias: "b", property: "file" },
  ]);
  expect(ast.limit).toBe(5);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser.test.ts`
Expected: FAIL — `Cannot find module '../src/tools/graph-query-parser.js'`

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
export type GraphQueryErrorKind =
  | "parse_error"
  | "validation_error"
  | "unsupported_error";

export class GraphQueryError extends Error {
  constructor(public kind: GraphQueryErrorKind, message: string) {
    super(message);
    this.name = "GraphQueryError";
  }
}

export interface NodePattern {
  alias: string;
  filters: Partial<Record<"kind" | "name", string>>;
}

export interface EdgePattern {
  alias?: string;
  kind?: string;
  direction: "out" | "in";
}

export interface WhereClause {
  alias: string;
  property: string;
  value: string;
}

export type ReturnProjection =
  | { kind: "alias"; alias: string }
  | { kind: "property"; alias: string; property: string };

export interface GraphQueryAst {
  match: {
    left: NodePattern;
    edge?: EdgePattern;
    right?: NodePattern;
  };
  where: WhereClause[];
  returns: ReturnProjection[];
  limit?: number;
}

function parseNodePattern(input: string): NodePattern {
  const match = input.trim().match(/^\(([^\s\{\)]+)\s*(\{[^\}]+\})?\)$/);
  if (!match) throw new GraphQueryError("parse_error", `invalid node pattern: ${input}`);

  const [, alias, rawFilters] = match;
  const filters: Partial<Record<"kind" | "name", string>> = {};
  if (rawFilters) {
    const inner = rawFilters.slice(1, -1).trim();
    for (const part of inner.split(",")) {
      const propMatch = part.trim().match(/^(kind|name)\s*:\s*"([^"]+)"$/);
      if (!propMatch) throw new GraphQueryError("parse_error", `invalid inline filter: ${part.trim()}`);
      filters[propMatch[1] as "kind" | "name"] = propMatch[2]!;
    }
  }

  return { alias, filters };
}

function parseEdgePattern(input: string): EdgePattern {
  const trimmed = input.trim();
  const out = trimmed.match(/^\[([^:\]]+)?(?::([^\]]+))?\]->$/);
  if (out) {
    return {
      alias: out[1] || undefined,
      kind: out[2] || undefined,
      direction: "out",
    };
  }

  const incoming = trimmed.match(/^<-\[([^:\]]+)?(?::([^\]]+))?\]$/);
  if (incoming) {
    return {
      alias: incoming[1] || undefined,
      kind: incoming[2] || undefined,
      direction: "in",
    };
  }

  throw new GraphQueryError("parse_error", `invalid edge pattern: ${input}`);
}

function splitClauses(query: string): { matchClause: string; whereClause?: string; returnClause: string; limitClause?: string } {
  const normalized = query.trim();
  const match = normalized.match(/^MATCH\s+([\s\S]+?)\s+RETURN\s+([\s\S]+?)(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) {
    throw new GraphQueryError("parse_error", "expected MATCH ... RETURN ...");
  }

  let matchClause = match[1]!.trim();
  const returnClause = match[2]!.trim();
  const limitClause = match[3];
  let whereClause: string | undefined;

  const whereSplit = matchClause.match(/^([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
  if (whereSplit) {
    matchClause = whereSplit[1]!.trim();
    whereClause = whereSplit[2]!.trim();
  }

  return { matchClause, whereClause, returnClause, limitClause };
}

function parseWhere(whereClause?: string): WhereClause[] {
  if (!whereClause) return [];
  return whereClause.split(/\s+AND\s+/i).map((piece) => {
    const match = piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"$/);
    if (!match) throw new GraphQueryError("parse_error", `invalid WHERE predicate: ${piece.trim()}`);
    return {
      alias: match[1]!,
      property: match[2]!,
      value: match[3]!,
    };
  });
}

function parseReturns(returnClause: string): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
    if (prop) {
      return { kind: "property" as const, alias: prop[1]!, property: prop[2]! };
    }
    return { kind: "alias" as const, alias: trimmed };
  });
}

export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);

  const traversalMatch = matchClause.match(/^(\([^\)]+\))\s*-(\[[^\]]*\]->|<\[[^\]]*\])\s*(\([^\)]+\))$/);
  if (traversalMatch) {
    return {
      match: {
        left: parseNodePattern(traversalMatch[1]!),
        edge: parseEdgePattern(traversalMatch[2]!),
        right: parseNodePattern(traversalMatch[3]!),
      },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause),
      limit: limitClause ? Number(limitClause) : undefined,
    };
  }

  return {
    match: { left: parseNodePattern(matchClause) },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause),
    limit: limitClause ? Number(limitClause) : undefined,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
