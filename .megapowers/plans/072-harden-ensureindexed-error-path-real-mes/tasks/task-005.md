---
id: 5
title: "RC-A/ast-grep: guard writes in applyRoutesToMatches and applyRendersMatches"
status: approved
depends_on:
  - 4
no_test: false
files_to_modify:
  - src/indexer/ast-grep.ts
files_to_create:
  - test/ast-grep-guarded-writes.test.ts
---

Guard the three unguarded store mutations in `applyRoutesToMatches` (`addNode` at line
208, `addEdge` at line 209) and `applyRendersMatches` (`addEdge` at line 244). Per-match
failures must not abort the stage.

This task explicitly covers two guarded sites: the `routes_to` test forces a failure
on `store.addNode(endpointNode)` (proving the `addNode` guard) and the `renders` test
forces a failure on `store.addEdge` (proving the `addEdge` guard in
`applyRendersMatches`). Together with the `addEdge` wrap inside
`applyRoutesToMatches` (which is inside the same guarded block as `addNode`), all
three write sites from `src/indexer/ast-grep.ts:208, 209, 244` are covered.

**Files:**
- Modify: `src/indexer/ast-grep.ts`
- Create: `test/ast-grep-guarded-writes.test.ts`

**Step 1 — Write the failing test**

Exports from `src/indexer/ast-grep.ts` (confirmed via `read`):
```ts
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void
export interface AstGrepRule { name; pattern; lang; produces: { edge_kind; from_capture?; ...; confidence; } }
export interface SgMatch { file: string; line: number; column: number; metaVariables: Record<string, string | string[]>; }
```

Create `test/ast-grep-guarded-writes.test.ts`:

```ts
import { expect, test, describe } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { applyRuleMatches, type AstGrepRule, type SgMatch } from "../src/indexer/ast-grep.js";
import type { GraphEdge } from "../src/graph/types.js";

function makeStore(): { store: SqliteGraphStore; dir: string } {
  const dir = join(tmpdir(), `pi-cg-astgrep-guard-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const store = new SqliteGraphStore(join(dir, "graph.db"));
  return { store, dir };
}

describe("RC-A/ast-grep: applyRuleMatches writes are guarded", () => {
  test("routes_to: addNode throw does not abort the stage", () => {
    const { store, dir } = makeStore();
    try {
      store.addNode({
        id: "src/r.ts::handlerA", kind: "function", name: "handlerA",
        file: "src/r.ts", start_line: 10, end_line: 10, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/r.ts::handlerB", kind: "function", name: "handlerB",
        file: "src/r.ts", start_line: 20, end_line: 20, content_hash: "h", is_exported: true,
      });
      const rule: AstGrepRule = {
        name: "express-route",
        pattern: "...",
        lang: "typescript",
        produces: {
          edge_kind: "routes_to",
          from_capture: "HANDLER",
          to_template: "endpoint:{METHOD}:{PATH}",
          confidence: 0.8,
        },
      };
      const matches: SgMatch[] = [
        {
          file: "src/r.ts",
          line: 10,
          column: 1,
          metaVariables: { METHOD: "get", PATH: "/a", HANDLER: "handlerA" },
        },
        {
          file: "src/r.ts",
          line: 20,
          column: 1,
          metaVariables: { METHOD: "get", PATH: "/b", HANDLER: "handlerB" },
        },
      ];

      // Fault the endpoint `addNode` call, not `addEdge`. This forces the
      // implementation to wrap `store.addNode(endpointNode)` (src/indexer/ast-grep.ts:208)
      // in a try/catch as well — guarding only `store.addEdge(...)` would let the
      // first throw propagate out of `applyRoutesToMatches` and abort the stage.
      const originalAddNode = SqliteGraphStore.prototype.addNode;
      let endpointNodeWrites = 0;
      SqliteGraphStore.prototype.addNode = function (node) {
        if (node.kind === "endpoint") {
          endpointNodeWrites++;
          if (endpointNodeWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddNode.call(this, node);
      };

      try {
        applyRuleMatches(store, rule, matches);
      } finally {
        SqliteGraphStore.prototype.addNode = originalAddNode;
      }

      // Both matches attempted an endpoint addNode — stage did not abort.
      expect(endpointNodeWrites).toBe(2);
      // The second match persisted a `routes_to` edge for handlerB.
      const edges = store.queryRows<{ source: string }>(
        "SELECT source FROM edges WHERE kind = 'routes_to' AND provenance_source = 'ast-grep'",
      );
      expect(edges.length).toBe(1);
      expect(edges[0]!.source).toBe("src/r.ts::handlerB");
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("renders: addEdge throw does not abort the stage", () => {
    const { store, dir } = makeStore();
    try {
      store.addNode({
        id: "src/v.tsx::Page", kind: "function", name: "Page",
        file: "src/v.tsx", start_line: 1, end_line: 50, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/v.tsx::HeaderA", kind: "function", name: "HeaderA",
        file: "src/v.tsx", start_line: 60, end_line: 60, content_hash: "h", is_exported: true,
      });
      store.addNode({
        id: "src/v.tsx::HeaderB", kind: "function", name: "HeaderB",
        file: "src/v.tsx", start_line: 70, end_line: 70, content_hash: "h", is_exported: true,
      });

      const rule: AstGrepRule = {
        name: "react-render",
        pattern: "...",
        lang: "typescript",
        produces: {
          edge_kind: "renders",
          from_context: "enclosing_function",
          to_capture: "COMPONENT",
          confidence: 0.7,
        },
      };
      const matches: SgMatch[] = [
        { file: "src/v.tsx", line: 10, column: 1, metaVariables: { COMPONENT: "HeaderA" } },
        { file: "src/v.tsx", line: 20, column: 1, metaVariables: { COMPONENT: "HeaderB" } },
      ];

      const originalAddEdge = SqliteGraphStore.prototype.addEdge;
      let renderWrites = 0;
      SqliteGraphStore.prototype.addEdge = function (edge: GraphEdge) {
        if (edge.kind === "renders") {
          renderWrites++;
          if (renderWrites === 1) throw new Error("SQLITE_BUSY: database is locked");
        }
        return originalAddEdge.call(this, edge);
      };

      try {
        applyRuleMatches(store, rule, matches);
      } finally {
        SqliteGraphStore.prototype.addEdge = originalAddEdge;
      }

      expect(renderWrites).toBe(2);
      const edges = store.queryRows<{ source: string }>(
        "SELECT source FROM edges WHERE kind = 'renders' AND provenance_source = 'ast-grep'",
      );
      expect(edges.length).toBe(1);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/ast-grep-guarded-writes.test.ts`

Expected: FAIL — both tests abort because `SQLITE_BUSY: database is locked`
propagates out of `applyRuleMatches`. The runner prints, for example for the
`routes_to` test:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/ast-grep.ts:208 ...
```
and for the `renders` test:
```
error: SQLITE_BUSY: database is locked
    at ... src/indexer/ast-grep.ts:244 ...
```
The `expect(...)` assertions are never reached.

**Step 3 — Write minimal implementation**

Edit `src/indexer/ast-grep.ts`:

Change 1 — `applyRoutesToMatches` inner-loop body at lines 197-221. Wrap
`store.addNode` + `store.addEdge` as one guarded block:

Before (lines 196-221):
```ts
    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = { /* ... */ };
      store.addNode(endpointNode);
      store.addEdge({ /* ... */ });
    }
```
After:
```ts
    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = {
        id: endpointId,
        kind: "endpoint",
        name: endpointId,
        file: match.file,
        start_line: match.line,
        end_line: match.line,
        content_hash: handlerNode.content_hash,
      };
      try {
        store.addNode(endpointNode);
        store.addEdge({
          source: handlerNode.id,
          target: endpointId,
          kind: "routes_to",
          provenance: {
            source: "ast-grep",
            confidence: rule.produces.confidence,
            evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
            content_hash: handlerNode.content_hash,
          },
          created_at: Date.now(),
        });
      } catch {
        // transient write failure — skip this match, continue stage
      }
    }
```

Change 2 — `applyRendersMatches` body at lines 237-255. Wrap `store.addEdge`:

Before (lines 244-255):
```ts
    store.addEdge({
      source: sourceNode.id,
      target: targetNode.id,
      kind: "renders",
      provenance: {
        source: "ast-grep",
        confidence: rule.produces.confidence,
        evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
        content_hash: sourceNode.content_hash,
      },
      created_at: Date.now(),
    });
```
After:
```ts
    try {
      store.addEdge({
        source: sourceNode.id,
        target: targetNode.id,
        kind: "renders",
        provenance: {
          source: "ast-grep",
          confidence: rule.produces.confidence,
          evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
          content_hash: sourceNode.content_hash,
        },
        created_at: Date.now(),
      });
    } catch {
      // transient write failure — skip this match, continue stage
    }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/ast-grep-guarded-writes.test.ts`

Expected: PASS — both tests pass. `routes_to`: `endpointNodeWrites === 2` and
the second match's `routes_to` edge (handlerB) is persisted. `renders`:
`renderWrites === 2` and the second match's `renders` edge persists.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing.
