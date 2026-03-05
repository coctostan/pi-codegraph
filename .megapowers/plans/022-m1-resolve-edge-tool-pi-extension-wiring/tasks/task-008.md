---
id: 8
title: deleteFile preserves agent edges while removing non-agent edges
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/graph/sqlite.ts
files_to_create:
  - test/graph-store-delete-agent-edges.test.ts
---

### Task 8: deleteFile preserves agent edges while removing non-agent edges [depends: 6]

Covers AC 11 and AC 12.

**Files:**
- Test: `test/graph-store-delete-agent-edges.test.ts`
- Modify: `src/graph/sqlite.ts`

**Step 1 — Write the failing test**
```typescript
// test/graph-store-delete-agent-edges.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("deleteFile preserves agent edges while still deleting file nodes and hash", () => {
  const store = new SqliteGraphStore();

  const nodeA = { id: "src/a.ts::foo:1", kind: "function" as const, name: "foo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: "ha" };
  const nodeB = { id: "src/b.ts::bar:1", kind: "function" as const, name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: "hb" };

  store.addNode(nodeA);
  store.addNode(nodeB);
  store.setFileHash("src/a.ts", "fha");

  store.addEdge({
    source: nodeA.id,
    target: nodeB.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: "e1" },
    created_at: 1,
  });

  store.addEdge({
    source: nodeA.id,
    target: nodeB.id,
    kind: "imports",
    provenance: { source: "agent", confidence: 0.7, evidence: "agent resolved", content_hash: "e2" },
    created_at: 2,
  });

  store.deleteFile("src/a.ts");

  // AC12
  expect(store.getNodesByFile("src/a.ts")).toEqual([]);
  expect(store.getFileHash("src/a.ts")).toBeNull();

  // AC11
  store.addNode(nodeA);
  const neighbors = store.getNeighbors(nodeA.id, { direction: "out" });
  expect(neighbors).toHaveLength(1);
  expect(neighbors[0]!.edge.provenance.source).toBe("agent");
  expect(neighbors[0]!.edge.kind).toBe("imports");

  store.close();
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/graph-store-delete-agent-edges.test.ts`
Expected: FAIL — `expect(received).toHaveLength(expected)` because `deleteFile` currently deletes all edges, including agent edges

**Step 3 — Write minimal implementation**
```typescript
// src/graph/sqlite.ts
deleteFile(file: string): void {
  this.db.exec("BEGIN");
  try {
    this.db
      .query(
        `DELETE FROM edges
         WHERE provenance_source != 'agent'
           AND (source IN (SELECT id FROM nodes WHERE file = ?)
             OR target IN (SELECT id FROM nodes WHERE file = ?))`
      )
      .run(file, file);

    this.db.query(`DELETE FROM nodes WHERE file = ?`).run(file);
    this.db.query(`DELETE FROM file_hashes WHERE file = ?`).run(file);

    this.db.exec("COMMIT");
  } catch (error) {
    this.db.exec("ROLLBACK");
    throw error;
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/graph-store-delete-agent-edges.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
