---
id: 1
title: "Tokenizer: split camelCase, snake_case, and whitespace"
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/bm25.ts
  - test/bm25-tokenizer.test.ts
---

### Task 1: Tokenizer: split camelCase, snake_case, and whitespace

**Files:**
- Create: `src/tools/bm25.ts`
- Create: `test/bm25-tokenizer.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/bm25-tokenizer.test.ts
import { expect, test } from "bun:test";
import { tokenize } from "../src/tools/bm25.js";

test("tokenize splits camelCase into lowercase terms", () => {
  expect(tokenize("getNodesByFile")).toEqual(["get", "nodes", "by", "file"]);
});

test("tokenize splits snake_case into lowercase terms", () => {
  expect(tokenize("content_hash")).toEqual(["content", "hash"]);
});

test("tokenize splits whitespace", () => {
  expect(tokenize("graph store")).toEqual(["graph", "store"]);
});

test("tokenize handles mixed camelCase, snake_case, and whitespace", () => {
  expect(tokenize("myFunc_name here")).toEqual(["my", "func", "name", "here"]);
});

test("tokenize lowercases all terms", () => {
  expect(tokenize("GraphStore")).toEqual(["graph", "store"]);
});

test("tokenize returns empty array for empty string", () => {
  expect(tokenize("")).toEqual([]);
});

test("tokenize handles single word", () => {
  expect(tokenize("foo")).toEqual(["foo"]);
});

test("tokenize handles all-uppercase abbreviations", () => {
  expect(tokenize("parseJSON")).toEqual(["parse", "json"]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/bm25-tokenizer.test.ts`
Expected: FAIL — error: Cannot find module "../src/tools/bm25.js"

**Step 3 — Write minimal implementation**

```typescript
// src/tools/bm25.ts
export function tokenize(input: string): string[] {
  if (!input) return [];
  // Split on whitespace first
  const parts = input.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const part of parts) {
    // Split on underscores
    const segments = part.split(/_+/).filter(Boolean);
    for (const seg of segments) {
      // Split camelCase: insert boundary before uppercase letters
      // Handle sequences like "parseJSON" -> "parse", "JSON"
      const camelParts = seg.replace(/([a-z])([A-Z])/g, "$1\0$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
        .split("\0")
        .filter(Boolean);
      for (const cp of camelParts) {
        tokens.push(cp.toLowerCase());
      }
    }
  }
  return tokens;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/bm25-tokenizer.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
