---
id: 2
title: Document valid symbol_graph include values in public docs
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - README.md
  - docs/tool-descriptions.md
  - test/docs-symbol-graph-unified-surface.test.ts
files_to_create: []
---

### Task 2: Document valid symbol_graph include values in public docs [depends: 1]

**Files:**
- Modify: `README.md`
- Modify: `docs/tool-descriptions.md`
- Test: `test/docs-symbol-graph-unified-surface.test.ts`

**Step 1 — Write the failing test**
Build on the existing unified-surface regression test and replace `test/docs-symbol-graph-unified-surface.test.ts` with:

```ts
import { test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public docs explain symbol_graph include values without implying tests is valid", () => {
  const readme = read("README.md");
  const architecture = read("ARCHITECTURE.md");
  const guide = read("docs/tool-descriptions.md");
  const expectedDescription = "Return a compact symbol summary with relationships, test signals, and key metadata.";
  const expectedIncludeGuidance =
    'Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.';
  const expectedDefaultGuidance =
    'By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.';

  if (!readme.includes(expectedIncludeGuidance)) {
    throw new Error("README is missing explicit symbol_graph include guidance");
  }
  if (!readme.includes(expectedDefaultGuidance)) {
    throw new Error("README is missing default symbol_graph test-signals guidance");
  }
  if (!readme.includes(expectedDescription)) {
    throw new Error("README is missing updated symbol_graph description");
  }
  if (readme.includes("Return a symbol's callers, callees, tests, and key signals.")) {
    throw new Error("README still uses stale symbol_graph wording");
  }
  if (readme.includes("#### `symbol_card`")) {
    throw new Error("README must not reintroduce the removed symbol_card section");
  }
  if (readme.includes("#### `symbol_contract`")) {
    throw new Error("README must not reintroduce the removed symbol_contract section");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["neighborhood"] })')) {
    throw new Error("README lost neighborhood include example");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["contract"] })')) {
    throw new Error("README lost contract include example");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["source"] })')) {
    throw new Error("README lost source include example");
  }
  if (!readme.includes('symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })')) {
    throw new Error("README lost combined include example");
  }
  if (readme.includes('include: ["tests"]')) {
    throw new Error("README must not show tests as a valid include example");
  }

  if (!guide.includes(`- \`${expectedDescription}\``)) {
    throw new Error("tool description guide is missing updated symbol_graph example");
  }
  if (guide.includes("Return a symbol's callers, callees, tests, and key signals.")) {
    throw new Error("tool description guide still uses stale symbol_graph wording");
  }
  if (!guide.includes("Parameter-level notes such as `symbol_graph.include` usage belong in README or schema docs, not in top-level tool descriptions.")) {
    throw new Error("tool description guide lost the schema-vs-description guidance");
  }

  if (!architecture.includes("symbol_graph")) {
    throw new Error("ARCHITECTURE.md lost symbol_graph reference");
  }
  if (architecture.includes("symbol_card tool")) {
    throw new Error("ARCHITECTURE.md unexpectedly references symbol_card tool");
  }
  if (architecture.includes("symbol_contract tool")) {
    throw new Error("ARCHITECTURE.md unexpectedly references symbol_contract tool");
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: FAIL — `error: README is missing explicit symbol_graph include guidance`

**Step 3 — Write minimal implementation**
Replace the current `symbol_graph` subsection in `README.md` with:
````md
#### `symbol_graph`
Return a compact symbol summary with relationships, test signals, and key metadata.
By default, `symbol_graph({ name: "validateToken" })` already includes test signals in the compact card.
Allowed include values: `"neighborhood"`, `"contract"`, `"source"`. `"tests"` is not a valid include value.
```
symbol_graph({ name: "validateToken" })
symbol_graph({ name: "validateToken", file: "src/auth.ts" })
symbol_graph({ name: "validateToken", include: ["neighborhood"] })
symbol_graph({ name: "validateToken", include: ["contract"] })
symbol_graph({ name: "validateToken", include: ["source"] })
symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })
```
````

In `docs/tool-descriptions.md`, replace the current symbol-graph example under `## Good` with:

```md
- `Return a compact symbol summary with relationships, test signals, and key metadata.`
  `When to use: You need structural context for a named symbol.`
```

Leave the existing maintenance note about `symbol_graph.include` in place; this task is only aligning the public docs with the registered surface contract.

**Step 4 — Run test, verify it passes**
Run: `bun test test/docs-symbol-graph-unified-surface.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
