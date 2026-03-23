---
id: 2
title: Reject self-referential edges in resolveEdge
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
files_to_create:
  - test/tool-resolve-edge-self-ref.test.ts
---

### Task 2: Reject self-referential edges in resolveEdge

**Files:**
- Modify: `src/tools/resolve-edge.ts`
- Create: `test/tool-resolve-edge-self-ref.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-resolve-edge-self-ref.test.ts`:

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveEdge } from "../src/tools/resolve-edge.js";

test("resolveEdge rejects self-referential edge (source === target)", () => {
  const store = new SqliteGraphStore();
  const projectRoot = "/tmp/test-project";

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

  const result = resolveEdge({
    source: "foo",
    target: "foo",
    kind: "calls",
    evidence: "foo calls itself recursively",
    store,
    projectRoot,
  });

  // Should reject, not create
  expect(result).not.toContain("Edge created");
  expect(result).not.toContain("Edge updated");
  expect(result).toContain("same node");
});

test("resolveEdge allows edge between different nodes with same name in different files", () => {
  const store = new SqliteGraphStore();
  const projectRoot = "/tmp/test-project";

  store.addNode({
    id: "src/a.ts::init:1",
    kind: "function",
    name: "init",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
    is_exported: false,
  });
  store.addNode({
    id: "src/b.ts::init:1",
    kind: "function",
    name: "init",
    file: "src/b.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "def456",
    is_exported: false,
  });

  const result = resolveEdge({
    source: "init",
    target: "init",
    sourceFile: "src/a.ts",
    targetFile: "src/b.ts",
    kind: "calls",
    evidence: "a/init calls b/init",
    store,
    projectRoot,
  });

  // Different nodes — should succeed
  expect(result).toContain("Edge created");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-resolve-edge-self-ref.test.ts`

Expected: FAIL —
```
error: expect(received).not.toContain(expected)
Expected to NOT contain: "Edge created"
Received: "Edge created:\n  source: src/a.ts:1:?  foo\n  target: src/a.ts:1:?  foo\n  kind: calls\n  provenance: agent  confidence:0.7"
```
(First test fails because the self-referential edge is accepted. Second test should pass since those are different nodes.)

**Step 3 — Write minimal implementation**

In `src/tools/resolve-edge.ts`, add a self-reference check after the edge kind validation. Find:

```ts
  const sourceNode = sourceNodes[0]!;
  const targetNode = targetNodes[0]!;
```

Replace with:

```ts
  const sourceNode = sourceNodes[0]!;
  const targetNode = targetNodes[0]!;

  // Reject self-referential edges
  if (sourceNode.id === targetNode.id) {
    return `Cannot create edge: source and target resolve to the same node ("${sourceNode.name}" in ${sourceNode.file})`;
  }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-resolve-edge-self-ref.test.ts`
Expected: PASS — both tests pass

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing
