---
id: 21
title: Reject unsupported projection properties
status: approved
depends_on:
  - 20
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-validation-projection-property.test.ts
---

### Task 21: Reject unsupported projection properties [depends: 20]

**Covers AC:** 27

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-validation-projection-property.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unsupported projection properties", () => {
  expect(() => parseGraphQuery('MATCH (a {name: "foo"}) RETURN a.missing'))
    .toThrowError(/property "missing" is not allowed on alias "a"/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-validation-projection-property.test.ts`
Expected: FAIL — parser currently allows unknown projection properties

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
const NODE_RETURN_PROPERTIES = new Set(["id", "kind", "name", "file", "start_line", "end_line", "content_hash"]);
const EDGE_RETURN_PROPERTIES = new Set(["source", "target", "kind", "provenance_source", "confidence", "evidence", "content_hash", "created_at"]);

function parseReturns(returnClause: string, nodeAliases: Set<string>, edgeAliases: Set<string>): ReturnProjection[] {
  return returnClause.split(",").map((piece) => {
    const trimmed = piece.trim();
    const prop = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);

    if (!prop) {
      if (!nodeAliases.has(trimmed) && !edgeAliases.has(trimmed)) {
        throw new GraphQueryError("validation_error", `alias "${trimmed}" is not bound`);
      }
      return { kind: "alias" as const, alias: trimmed };
    }

    const alias = prop[1]!;
    const property = prop[2]!;

    if (!nodeAliases.has(alias) && !edgeAliases.has(alias)) {
      throw new GraphQueryError("validation_error", `alias "${alias}" is not bound`);
    }

    if (nodeAliases.has(alias) && !NODE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError("validation_error", `property "${property}" is not allowed on alias "${alias}"`);
    }

    if (edgeAliases.has(alias) && !EDGE_RETURN_PROPERTIES.has(property)) {
      throw new GraphQueryError("validation_error", `property "${property}" is not allowed on alias "${alias}"`);
    }

    return { kind: "property" as const, alias, property };
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-validation-projection-property.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
