---
id: 20
title: Reject unsupported node filter properties
status: approved
depends_on:
  - 13
no_test: false
files_to_modify:
  - src/tools/graph-query-parser.ts
files_to_create:
  - test/graph-query-parser-validation-filter-property.test.ts
---

### Task 20: Reject unsupported node filter properties [depends: 13]

**Covers AC:** 26

**Files:**
- Modify: `src/tools/graph-query-parser.ts`
- Test: `test/graph-query-parser-validation-filter-property.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { parseGraphQuery } from "../src/tools/graph-query-parser.js";

test("parseGraphQuery returns validation_error for unsupported node filter properties", () => {
  expect(() =>
    parseGraphQuery('MATCH (a {file: "src/a.ts"}) RETURN a'),
  ).toThrowError(/property "file" is not allowed on node alias "a"/);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-query-parser-validation-filter-property.test.ts`
Expected: FAIL — parser currently accepts unsupported inline filter keys

**Step 3 — Write minimal implementation**
`src/tools/graph-query-parser.ts`
```ts
const NODE_FILTER_PROPERTIES = new Set(["kind", "name"]);

function parseNodePattern(input: string): NodePattern {
  const match = input.trim().match(/^\(([A-Za-z_][A-Za-z0-9_]*)\s*(\{[^\}]+\})?\)$/);
  if (!match) throw new GraphQueryError("parse_error", `invalid node pattern: ${input}`);

  const [, alias, rawFilters] = match;
  const filters: Partial<Record<"kind" | "name", string>> = {};

  if (rawFilters) {
    const inner = rawFilters.slice(1, -1).trim();
    for (const part of inner.split(",")) {
      const propMatch = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]+)"$/);
      if (!propMatch) throw new GraphQueryError("parse_error", `invalid inline filter: ${part.trim()}`);

      const property = propMatch[1]!;
      if (!NODE_FILTER_PROPERTIES.has(property)) {
        throw new GraphQueryError("validation_error", `property "${property}" is not allowed on node alias "${alias}"`);
      }

      filters[property as "kind" | "name"] = propMatch[2]!;
    }
  }

  return { alias: alias!, filters };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-query-parser-validation-filter-property.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
