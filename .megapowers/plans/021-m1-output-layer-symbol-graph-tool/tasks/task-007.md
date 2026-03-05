---
id: 7
title: rankNeighbors breaks confidence ties by created_at descending
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - test/output-rank-neighbors.test.ts
files_to_create: []
---

**Spec criteria:** 13

**Files:**
- Test: `test/output-rank-neighbors.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-rank-neighbors.test.ts`:

```typescript
test("rankNeighbors breaks confidence ties by created_at descending (newer first)", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("older", 0.5, 1000),
    makeNeighbor("newer", 0.5, 2000),
    makeNeighbor("newest", 0.5, 3000),
  ];

  const result = rankNeighbors(neighbors, 3);

  expect(result.kept[0]!.node.name).toBe("newest");
  expect(result.kept[1]!.node.name).toBe("newer");
  expect(result.kept[2]!.node.name).toBe("older");
  expect(result.omitted).toBe(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS — The implementation from Task 6 already includes the `created_at` tiebreaker. This test explicitly verifies the behavior.

**Step 3 — No additional implementation needed**

Task 6 implementation sorts by `b.edge.created_at - a.edge.created_at` when confidence is equal.

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
