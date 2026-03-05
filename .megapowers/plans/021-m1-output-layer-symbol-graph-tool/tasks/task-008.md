---
id: 8
title: rankNeighbors returns all items when count is within limit
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - test/output-rank-neighbors.test.ts
files_to_create: []
---

**Spec criteria:** 12

**Files:**
- Test: `test/output-rank-neighbors.test.ts`

**Step 1 — Write the failing test**

Append to `test/output-rank-neighbors.test.ts`:

```typescript
test("rankNeighbors returns all items with omitted=0 when within limit", () => {
  const neighbors: NeighborResult[] = [
    makeNeighbor("a", 0.8),
    makeNeighbor("b", 0.6),
  ];

  const result = rankNeighbors(neighbors, 10);

  expect(result.kept).toHaveLength(2);
  expect(result.kept[0]!.node.name).toBe("a");
  expect(result.kept[1]!.node.name).toBe("b");
  expect(result.omitted).toBe(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS — Task 6 implementation already handles this. This test covers spec criterion 12 explicitly.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `bun test test/output-rank-neighbors.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
