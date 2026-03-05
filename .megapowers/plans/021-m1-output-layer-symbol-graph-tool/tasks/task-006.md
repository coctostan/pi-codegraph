---
id: 6
title: rankNeighbors sorts by confidence and truncates to limit
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/output/anchoring.ts
files_to_create:
  - test/output-rank-neighbors.test.ts
---

**Spec criteria:** 10, 11

**Files:**
- Modify: `src/output/anchoring.ts`
- Create: `test/output-rank-neighbors.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/output-rank-neighbors.test.ts
import { expect, test } from "bun:test";
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
      end_line: 3,
      content_hash: "h1",
    },
    edge: {
      source: `src/a.ts::${name}:1`,
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence,
        evidence: "direct call",
        content_hash: "eh1",
      },
      created_at: createdAt,
    },
  };
}

test("rankNeighbors sorts by confidence descending and truncates to limit", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("low", 0.3),
    makeNeighbor("high", 0.9),
    makeNeighbor("mid1", 0.5),
    makeNeighbor("mid2", 0.5),
    makeNeighbor("top", 1.0),
  ];

  const result = rankNeighbors(neighbors, 3);

  expect(result.kept).toHaveLength(3);
  expect(result.kept[0]!.node.name).toBe("top");
  expect(result.kept[1]!.node.name).toBe("high");
  // Third is one of the mid (0.5) — exact order tested in Task 7
  expect(result.kept[2]!.edge.provenance.confidence).toBe(0.5);
  expect(result.omitted).toBe(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: FAIL — TypeError: rankNeighbors is not a function (or import error)

**Step 3 — Write minimal implementation**

Add to `src/output/anchoring.ts`:

```typescript
import type { NeighborResult } from "../graph/store.js";

export interface RankResult {
  kept: NeighborResult[];
  omitted: number;
}

export function rankNeighbors(neighbors: NeighborResult[], limit: number): RankResult {
  const sorted = [...neighbors].sort((a, b) => {
    const confDiff = b.edge.provenance.confidence - a.edge.provenance.confidence;
    if (confDiff !== 0) return confDiff;
    return b.edge.created_at - a.edge.created_at;
  });

  const kept = sorted.slice(0, limit);
  return {
    kept,
    omitted: sorted.length - kept.length,
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
