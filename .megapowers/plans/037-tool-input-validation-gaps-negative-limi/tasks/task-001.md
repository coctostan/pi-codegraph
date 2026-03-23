---
id: 1
title: Guard rankNeighbors against negative limit
status: approved
depends_on: []
no_test: false
files_to_modify:
  - src/output/anchoring.ts
  - test/repro-037-validation-gaps.test.ts
files_to_create: []
---

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
