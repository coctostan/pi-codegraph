# Plan

### Task 1: Guard rankNeighbors against negative limit

### Task 1: Guard rankNeighbors against negative limit

**Files:**
- Modify: `src/output/anchoring.ts`
- Modify: `test/repro-037-validation-gaps.test.ts`

**Step 1 — Write the failing test**

Update `test/repro-037-validation-gaps.test.ts` to keep only the `rankNeighbors` tests. Replace the file with:

```ts
import { expect, test, describe } from "bun:test";
import { rankNeighbors } from "../src/output/anchoring.js";
import type { NeighborResult } from "../src/graph/store.js";

function makeNeighbor(name: string, confidence: number, createdAt: number = 1000): NeighborResult {
  return {
    node: {
      id: `src/a.ts::${name}:1`,
      kind: "function",
      name,
      file: "src/a.ts",
      start_line: 1,
      end_line: 5,
      content_hash: "abc123",
      is_exported: false,
    },
    edge: {
      source: "src/a.ts::caller:1",
      target: `src/a.ts::${name}:1`,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence, evidence: "test", content_hash: "abc123" },
      created_at: createdAt,
    },
  };
}

describe("rankNeighbors negative limit guard", () => {
  test("limit=-1 is treated as default (10), returns all when count < 10", () => {
    const neighbors = [
      makeNeighbor("a", 0.9),
      makeNeighbor("b", 0.8),
      makeNeighbor("c", 0.7),
      makeNeighbor("d", 0.6),
      makeNeighbor("e", 0.5),
    ];

    const result = rankNeighbors(neighbors, -1);
    // 5 items < default 10, so all should be kept
    expect(result.kept.length).toBe(5);
    expect(result.omitted).toBe(0);
  });

  test("limit=-100 is treated as default (10)", () => {
    const neighbors = Array.from({ length: 15 }, (_, i) =>
      makeNeighbor(`fn${i}`, 0.9 - i * 0.01)
    );

    const result = rankNeighbors(neighbors, -100);
    // Default is 10, so 10 kept, 5 omitted
    expect(result.kept.length).toBe(10);
    expect(result.omitted).toBe(5);
  });

  test("limit=0 still returns none (existing behavior preserved)", () => {
    const neighbors = [makeNeighbor("a", 0.9)];
    const result = rankNeighbors(neighbors, 0);
    expect(result.kept.length).toBe(0);
    expect(result.omitted).toBe(1);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/repro-037-validation-gaps.test.ts`

Expected: FAIL —
```
error: expect(received).toBe(expected)
Expected: 5
Received: 4
```
(The first test fails because `slice(0, -1)` returns 4 of 5 items.)

**Step 3 — Write minimal implementation**

In `src/output/anchoring.ts`, change the `rankNeighbors` function. Replace:

```ts
export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const sorted = [...neighbors].sort((a, b) => {
    const confidenceDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, limit);
```

With:

```ts
const DEFAULT_LIMIT = 10;

export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const effectiveLimit = limit < 1 ? DEFAULT_LIMIT : limit;
  const sorted = [...neighbors].sort((a, b) => {
    const confidenceDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, effectiveLimit);
```

This treats any `limit < 1` (negative values) as the default of 10, while `limit=0` now also becomes 10 (which is a behavior change). Wait — the spec says `limit=0` should "continue to return 0 items". Let me re-check...

Actually, the "Fixed When" criteria say: "2. `rankNeighbors(neighbors, 0)` continues to return 0 items (existing correct behavior preserved)". So the guard should be `limit < 0` not `limit < 1`. But the issue description says "treat `limit < 1` as the default (10)". Let me reconcile: the repro test has `limit=0` returning none as *correct existing behavior*. The diagnosis "Fixed When" explicitly says preserve `limit=0` returning 0 items. So the guard should be `limit < 0`:

```ts
const DEFAULT_LIMIT = 10;

export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const effectiveLimit = limit < 0 ? DEFAULT_LIMIT : limit;
  const sorted = [...neighbors].sort((a, b) => {
    const confidenceDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confidenceDiff !== 0) return confidenceDiff;

    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, effectiveLimit);
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/repro-037-validation-gaps.test.ts`
Expected: PASS — all 3 tests pass

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing

### Task 2: Reject self-referential edges in resolveEdge

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

### Task 3: Reject empty or whitespace-only evidence in resolveEdge

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
