---
id: 7
title: resolveEdge upserts same source→target→kind agent edge
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/resolve-edge.ts
  - test/tool-resolve-edge.test.ts
files_to_create: []
---

### Task 7: resolveEdge upserts same source→target→kind agent edge [depends: 6]

Covers AC 9.

**Files:**
- Test: `test/tool-resolve-edge.test.ts`
- Modify: `src/tools/resolve-edge.ts`

**Step 1 — Write the failing test**
```typescript
// Append to test/tool-resolve-edge.test.ts
test("resolveEdge upserts same source→target→kind agent edge", () => {
  const store = new SqliteGraphStore();

  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "h1" });
  store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "h2" });

  store.setFileHash("src/a.ts", "hash_v1");
  const result1 = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "first evidence",
    store,
    projectRoot: "/tmp/test",
  });
  expect(result1).toContain("created");

  store.setFileHash("src/a.ts", "hash_v2");
  const result2 = resolveEdge({
    source: "foo",
    target: "bar",
    kind: "calls",
    evidence: "updated evidence",
    store,
    projectRoot: "/tmp/test",
  });
  expect(result2).toContain("updated");

  const neighbors = store.getNeighbors("src/a.ts::foo:1", { direction: "out", kind: "calls" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.evidence).toBe("updated evidence");
  expect(neighbors[0]!.edge.provenance.content_hash).toBe("hash_v2");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: FAIL — second call still returns `"created"` instead of `"updated"`

**Step 3 — Write minimal implementation**
```typescript
// src/tools/resolve-edge.ts (inside resolveEdge, before addEdge)
const existingNeighbors = store.getNeighbors(sourceNode.id, { direction: "out", kind });
const existed = existingNeighbors.some(
  (nr) => nr.edge.target === targetNode.id && nr.edge.provenance.source === "agent"
);

store.addEdge({
  source: sourceNode.id,
  target: targetNode.id,
  kind,
  provenance: {
    source: "agent",
    confidence: 0.7,
    evidence,
    content_hash: contentHash,
  },
  created_at: Date.now(),
});

const action = existed ? "updated" : "created";
return [
  `Edge ${action}:`,
  `  source: ${sourceAnchor.anchor}  ${sourceNode.name}`,
  `  target: ${targetAnchor.anchor}  ${targetNode.name}`,
  `  kind: ${kind}`,
  "  provenance: agent  confidence:0.7",
].join("\n");
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-resolve-edge.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
