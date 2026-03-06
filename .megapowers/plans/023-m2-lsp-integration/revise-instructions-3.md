# Revise Instructions — Plan Iteration 3

## Task 1: Add TsServerClient request API and lifecycle

### Bug 1 — Step 1: `projectRoot` is never declared at module scope

The test file declares `let fakeTsserverPath: string;` at the top but uses `projectRoot` in
`beforeEach` and `afterEach` without ever declaring it. Add the missing declaration directly
after the `fakeTsserverPath` line:

```typescript
let fakeTsserverPath: string;
let projectRoot: string;   // ← ADD THIS

function createProjectFixture(): string {
```

### Bug 2 — Step 3: `request<T>` method has a syntax error — `pending.set` call is missing

The implementation code has this broken fragment after creating the timer:

```typescript
// BROKEN — the this.pending.set(...) call is missing; these are orphaned properties
const timer = setTimeout(() => {
  this.pending.delete(seq);
  rejectReq(new Error(`TsServer request timed out: ${command}`));
}, this.timeoutMs);
  resolve: (v) => resolveReq(v as T),   // ← syntax error
  reject: rejectReq,
  timer,
});
```

This will not parse. The `this.pending.set(seq, { ... })` call is entirely absent. Replace
the whole block inside the `new Promise<T>(...)` callback with:

```typescript
return new Promise<T>((resolveReq, rejectReq) => {
  const seq = ++this.seq;
  const timer = setTimeout(() => {
    this.pending.delete(seq);
    rejectReq(new Error(`TsServer request timed out: ${command}`));
  }, this.timeoutMs);

  this.pending.set(seq, {
    resolve: (v) => resolveReq(v as T),
    reject: rejectReq,
    timer,
  });

  const payload = JSON.stringify({ seq, type: "request", command, arguments: args });
  this.proc!.stdin!.write(payload + "\n");
});
```

---

## Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges

### Bug — Step 3: `parsed` is never declared before `if (!parsed) continue;`

The implementation loop body has:

```typescript
const sourceNode = store.getNode(edge.source);
if (!sourceNode) continue;
if (!parsed) continue;      // ← 'parsed' is undefined — never assigned!
```

The `parseEvidence(edge.provenance.evidence)` call is missing. Add it between the two checks:

```typescript
const sourceNode = store.getNode(edge.source);
if (!sourceNode) continue;
const parsed = parseEvidence(edge.provenance.evidence);   // ← ADD THIS
if (!parsed) continue;
let loc;
try {
  loc = await client.definition(sourceNode.file, parsed.line, parsed.col);
```

---

## Task 6: Persist missing caller edges from LSP references when `symbol_graph` is invoked

### Bug 1 — Step 1: `SqliteGraphStore` is used but not imported

The test uses `new SqliteGraphStore()` in multiple places but the import statement is
missing from the Step 1 test code. Add this import at the top of the new test file:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";   // ← ADD THIS
import { nodeId } from "../src/graph/types.js";
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
import type { ITsServerClient, LspLocation } from "../src/indexer/tsserver-client.js";
```

### Bug 2 — Step 3: `hasMarker` leaves stale markers after `deleteFile` (AC25 partial gap)

When tree-sitter re-indexes a changed file, `deleteFile` deletes the marker→symbol edge
(because the symbol node is in the re-indexed file), but the marker **node** itself survives
because it lives in `file: "__meta__/resolver"`. Since `hasMarker` only checks `getNode(...)`,
it returns `true` for stale markers, permanently blocking tool-time re-resolution after a file
change — violating AC25 ("forcing re-resolution on the next … tool query").

Fix `hasMarker` in `src/indexer/lsp-resolver.ts` to check that the marker→symbol edge
**still exists**, not just the marker node:

```typescript
// BEFORE
function hasMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): boolean {
  return store.getNode(markerNodeId(kind, symbol.id)) !== null;
}

// AFTER
function hasMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): boolean {
  const id = markerNodeId(kind, symbol.id);
  if (store.getNode(id) === null) return false;
  // After a file re-index the marker node survives but its outbound edge is deleted.
  // Only treat the marker as valid when the edge still points to the symbol.
  return store.getEdgesBySource(id).some((e) => e.target === symbol.id);
}
```

Also add a regression test in Step 1 for this scenario:

```typescript
test("resolveMissingCallers re-resolves after file re-index (stale marker edge cleared)", async () => {
  const store = new SqliteGraphStore();

  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  const caller = {
    id: nodeId("src/impl.ts", "run", 3),
    kind: "function" as const,
    name: "run",
    file: "src/impl.ts",
    start_line: 3,
    end_line: 6,
    content_hash: "h-impl",
  };
  store.addNode(target);
  store.addNode(caller);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 4, col: 5 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  // First resolution — sets marker
  await resolveMissingCallers(target, store, "/project", client);
  expect(calls).toBe(1);

  // Simulate file re-index: deleteFile removes symbol node and all non-agent edges
  // (including the marker→symbol edge), then re-adds the symbol.
  store.deleteFile("src/api.ts");
  store.addNode(target);
  store.addNode(caller); // caller may also be re-added if impl.ts changed

  // Second resolution — marker node exists but edge was deleted → should re-resolve
  await resolveMissingCallers(target, store, "/project", client);
  expect(calls).toBe(2);  // ← must NOT be blocked by stale marker

  store.close();
});
```

---

## Task 7: Persist interface implementation edges from LSP

### Bug — Step 1: `import` statement is placed inside the file body (mid-file)

The appended test code begins with:

```typescript
import { resolveImplementations } from "../src/indexer/lsp-resolver.js";
test("resolveImplementations persists implements edges...
```

ES module `import` declarations must appear at the top of the file. Since this task
**appends** to an existing file, the import must instead be **merged into the existing import
line** at the top of `test/tool-symbol-graph-lsp.test.ts`.

Step 1 must instruct the implementer to update the existing import (not append a new one):

```typescript
// Replace existing import line:
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";

// With:
import { resolveMissingCallers, resolveImplementations } from "../src/indexer/lsp-resolver.js";
```

Then the appended test body starts immediately with the `test(...)` call — no import line
inside the body.
