---
id: 3
title: Reject empty or whitespace-only evidence in resolveEdge
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
files_to_create:
  - test/tool-resolve-edge-empty-evidence.test.ts
---

### Task 3: Reject empty or whitespace-only evidence in resolveEdge

**Files:**
- Modify: `src/tools/resolve-edge.ts`
- Create: `test/tool-resolve-edge-empty-evidence.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-resolve-edge-empty-evidence.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveEdge } from "../src/tools/resolve-edge.js";

function makeStore() {
  const store = new SqliteGraphStore();
  store.addNode({
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
    is_exported: false,
  });
  store.addNode({
    id: "src/a.ts::bar:10",
    kind: "function",
    name: "bar",
    file: "src/a.ts",
    start_line: 10,
    end_line: 15,
    content_hash: "def456",
    is_exported: false,
  });
  return store;
}

test("resolveEdge rejects empty evidence string", () => {
  const store = makeStore();

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "",
    store,
    projectRoot: "/tmp/test-project",
  });

  expect(result).not.toContain("Edge created");
  expect(result).not.toContain("Edge updated");
  expect(result).toContain("evidence");
});

test("resolveEdge rejects whitespace-only evidence", () => {
  const store = makeStore();

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "   \t\n  ",
    store,
    projectRoot: "/tmp/test-project",
  });

  expect(result).not.toContain("Edge created");
  expect(result).not.toContain("Edge updated");
  expect(result).toContain("evidence");
});

test("resolveEdge accepts non-empty evidence", () => {
  const store = makeStore();

  const result = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "foo calls bar in the handler",
    store,
    projectRoot: "/tmp/test-project",
  });

  expect(result).toContain("Edge created");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-resolve-edge-empty-evidence.test.ts`

Expected: FAIL —
```
error: expect(received).not.toContain(expected)
Expected to NOT contain: "Edge created"
Received: "Edge created:\n  source: src/a.ts:1:?  foo\n  target: src/a.ts:10:?  bar\n  kind: calls\n  provenance: agent  confidence:0.7"
```
(First two tests fail because empty/whitespace evidence is accepted. Third test should pass.)

**Step 3 — Write minimal implementation**

In `src/tools/resolve-edge.ts`, add an evidence validation check early in the function, right after destructuring. Find:

```ts
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

  // Look up source node
```

Replace with:

```ts
  const { source, target, sourceFile, targetFile, kind, evidence, store, projectRoot } = params;

  // Validate evidence is non-empty
  if (!evidence || evidence.trim().length === 0) {
    return "Evidence is required — provide a non-empty explanation for this edge";
  }

  // Look up source node
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-resolve-edge-empty-evidence.test.ts`
Expected: PASS — all 3 tests pass

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing
