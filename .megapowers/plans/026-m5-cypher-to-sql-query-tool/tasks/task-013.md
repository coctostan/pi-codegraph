---
id: 13
title: Validate alias references in graph queries
status: approved
depends_on:
  - 12
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-validation-alias.test.ts
---

### Task 13: Validate alias references in graph queries [depends: 12]

**Covers AC:** 25

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-validation-alias.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unbound aliases", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN b'))
    .toThrowError(/alias "b" is not bound/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-validation-alias.test.ts`
Expected: FAIL — undeclared aliases currently parse through

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
function parseReturns(returnClause: string, nodeAliases: Set<string>, edgeAliases: Set<string>): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);

    if (prop) {
      const alias = prop[1]!;
      const property = prop[2]!;
      if (!nodeAliases.has(alias) && !edgeAliases.has(alias)) {
        throw new GraphQueryError("validation_error", `alias "${alias}" is not bound`);
      }
      return { kind: "property" as const, alias, property };
    }

    if (!nodeAliases.has(trimmed) && !edgeAliases.has(trimmed)) {
      throw new GraphQueryError("validation_error", `alias "${trimmed}" is not bound`);
    }

    return { kind: "alias" as const, alias: trimmed };
  });
}

export function parseGraphQuery(query: string): GraphQueryAst {
  const { matchClause, whereClause, returnClause, limitClause } = splitClauses(query);
  const limit = limitClause ? Number(limitClause) : undefined;

  const traversalMatch = matchClause.match(
    /^(\([^\)]+\))\s*(?:-(\[[^\]]*\])->|<-(\[[^\]]*\])-)(\([^\)]+\))$/,
  );

  if (traversalMatch) {
    const left = parseNodePattern(traversalMatch[1]!);
    const outgoingEdge = traversalMatch[2];
    const incomingEdge = traversalMatch[3];
    const right = parseNodePattern(traversalMatch[4]!);
    const edge = parseEdgePattern(outgoingEdge ? `${outgoingEdge}->` : `<-${incomingEdge!}`);

    const nodeAliases = new Set([left.alias, right.alias]);
    const edgeAliases = new Set<string>();
    if (edge.alias) edgeAliases.add(edge.alias);

    return {
      match: { left, edge, right },
      where: parseWhere(whereClause),
      returns: parseReturns(returnClause, nodeAliases, edgeAliases),
      limit,
    };
  }

  const left = parseNodePattern(matchClause);
  const nodeAliases = new Set([left.alias]);

  return {
    match: { left },
    where: parseWhere(whereClause),
    returns: parseReturns(returnClause, nodeAliases, new Set<string>()),
    limit,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-validation-alias.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
