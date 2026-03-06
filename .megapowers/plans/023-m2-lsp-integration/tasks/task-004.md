---
id: 4
title: Add eager LSP resolution stage for unresolved and confirmed call edges
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: false
files_to_modify: []
files_to_create:
  - src/indexer/lsp.ts
  - test/indexer-lsp.test.ts
---

### Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges [depends: 1, 2, 3]
- Create: `src/indexer/lsp.ts`
- Create: `test/indexer-lsp.test.ts`
This stage resolves both:
1) unresolved tree-sitter calls edges (`__unresolved__`) and
2) already-resolved tree-sitter calls edges (AC20) that should be upgraded to `lsp` provenance.

Use confidence `0.9` for all new `lsp` edges.

---

#### Step 1 — Test (RED)

Create `test/indexer-lsp.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runLspIndexStage } from "../src/indexer/lsp.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

function mkStore() {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::caller:1",
    kind: "function" as const,
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "h-a",
  };

  const callee = {
    id: "src/b.ts::target:1",
    kind: "function" as const,
    name: "target",
    file: "src/b.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h-b",
  };

  store.addNode(caller);
  store.addNode(callee);
  store.setFileHash(caller.file, caller.content_hash);
  store.setFileHash(callee.file, callee.content_hash);
  return { store, caller, callee };
}

test("resolves unresolved calls edge by evidence name + resolved file/line", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition(file, line, col) {
      expect(file).toBe("src/a.ts");
      expect(line).toBe(2);
      expect(col).toBe(5);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  expect(store.getUnresolvedEdges()).toHaveLength(0);

  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.target).toBe(callee.id);
  expect(out[0]!.provenance.confidence).toBe(0.9);

  store.close();
});

test("AC20: upgrades confirmed tree-sitter edge when definition matches existing target node", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: callee.id,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition(file, line, col) {
      expect(file).toBe("src/a.ts");
      expect(line).toBe(2);
      expect(col).toBe(5);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  const all = store.getEdgesBySource(caller.id);
  const lsp = all.filter((e) => e.target === callee.id && e.provenance.source === "lsp");
  const ts = all.filter((e) => e.target === callee.id && e.provenance.source === "tree-sitter");

  expect(lsp).toHaveLength(1);
  expect(lsp[0]!.provenance.confidence).toBe(0.9);
  expect(ts).toHaveLength(0);

  store.close();
});

test("partial results are preserved when tsserver crashes mid-stage", async () => {
  const { store, caller } = mkStore();

  const callee2 = {
    id: "src/c.ts::other:1",
    kind: "function" as const,
    name: "other",
    file: "src/c.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h-c",
  };
  store.addNode(callee2);

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "target:2:5", content_hash: "h-a" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::other:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "other:3:5", content_hash: "h-a" },
    created_at: 2000,
  });

  let n = 0;
  const client: ITsServerClient = {
    async definition() {
      n++;
      if (n === 1) return { file: "src/b.ts", line: 1, col: 17 };
      throw new Error("TsServer process exited unexpectedly");
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await expect(runLspIndexStage(store, "/project", client)).resolves.toBeUndefined();

  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(store.getUnresolvedEdges()).toHaveLength(1);

  store.close();
});

test("AC21: running the LSP stage twice produces no duplicate edges (idempotent)", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition() {
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);
  await runLspIndexStage(store, "/project", client); // second run — must be a no-op

  expect(store.getUnresolvedEdges()).toHaveLength(0);
  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1); // exactly 1, not 2
  expect(out[0]!.target).toBe(callee.id);

  store.close();
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/indexer-lsp.test.ts
```

Expected failure:

```text
error: Cannot find module "../src/indexer/lsp.js" from "test/indexer-lsp.test.ts"
```

---

#### Step 3 — Implementation

Create `src/indexer/lsp.ts`:

```typescript
import type { GraphEdge } from "../graph/types.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";
function parseEvidence(evidence: string): { name: string; line: number; col: number } | null {
  const parts = evidence.split(":");
  if (parts.length !== 3) return null;
  const [name, lineStr, colStr] = parts;
  const line = Number(lineStr);
  const col = Number(colStr);
  if (!name || !Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { name, line, col };
}

function isStartupError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("TsServer failed to start:");
}

function isUnresolvedTarget(target: string): boolean {
  return target.startsWith("__unresolved__::");
}

function makeLspEdge(source: string, target: string, evidence: string, contentHash: string): GraphEdge {
  return {
    source,
    target,
    kind: "calls",
    provenance: {
      source: "lsp",
      confidence: 0.9,
      evidence,
      content_hash: contentHash,
    },
    created_at: Date.now(),
  };
}
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  const unresolved = store.getUnresolvedEdges().filter((e) => e.kind === "calls" && e.provenance.source === "tree-sitter");

  const confirmed: GraphEdge[] = [];
  for (const file of store.listFiles()) {
    for (const node of store.getNodesByFile(file)) {
      for (const e of store.getEdgesBySource(node.id)) {
        if (e.kind === "calls" && e.provenance.source === "tree-sitter" && !isUnresolvedTarget(e.target)) {
          confirmed.push(e);
        }
      }
    }
  }

  const work = [...unresolved, ...confirmed];

  for (const edge of work) {
    const sourceNode = store.getNode(edge.source);
    if (!sourceNode) continue;
    const parsed = parseEvidence(edge.provenance.evidence);
    if (!parsed) continue;
    let loc;
    try {
      loc = await client.definition(sourceNode.file, parsed.line, parsed.col);
    } catch (err) {
      if (isStartupError(err)) return;
      continue;
    }

    if (!loc) continue;

    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
    if (!targetNode) continue;
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      continue;
    }

    const existingTarget = store.getNode(edge.target);
    if (!existingTarget) continue;

    const sameTarget = existingTarget.file === loc.file && existingTarget.start_line === loc.line;
    if (!sameTarget) continue;

    store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
    store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
  }
}
```

---

#### Step 4 — Run (PASS)

```bash
bun test test/indexer-lsp.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.
