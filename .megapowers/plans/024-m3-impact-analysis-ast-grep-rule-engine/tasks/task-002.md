---
id: 2
title: Add anchored impact output and register the impact tool
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/impact.ts
  - src/index.ts
files_to_create:
  - test/extension-impact.test.ts
---

### Task 2: Add anchored impact output and register the impact tool [depends: 1]
**Files:**
- Modify: `src/tools/impact.ts`
- Modify: `src/index.ts`
- Test: `test/extension-impact.test.ts`
Note: `computeAnchor()` is pre-existing in `src/output/anchoring.ts`; Step 1 includes a direct smoke test for its contract.
AC 28 note: `METHOD` is normalized with `toUpperCase()` before rendering `to_template`, so `endpoint:{METHOD}:{PATH}` yields IDs like `endpoint:GET:/users`.
**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { computeAnchor } from "../src/output/anchoring.js";
import { impact } from "../src/tools/impact.js";
test("computeAnchor returns existing anchor format file:line:hash and stale flag", () => {
  const root = join(tmpdir(), `pi-cg-anchor-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "f.ts"), "export function a() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/f.ts::a:1", kind: "function", name: "a", file: "src/f.ts", start_line: 1, end_line: 1, content_hash: "h" });
    const node = store.getNode("src/f.ts::a:1")!;
    const result = computeAnchor(node, root);
    expect(result.anchor).toMatch(/^src\/f\.ts:1:[0-9a-f]{4}$/);
    expect(typeof result.stale).toBe("boolean");

    const staleProbe = { ...node, start_line: 99, end_line: 99 };
    const staleResult = computeAnchor(staleProbe as any, root);
    expect(staleResult.stale).toBe(true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("impact() emits anchored structured lines and empty string for no-impact", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "caller.ts"), "import { shared } from './shared';\nexport function caller() { return shared(); }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: "h" });
    store.addNode({ id: "src/caller.ts::caller:2", kind: "function", name: "caller", file: "src/caller.ts", start_line: 2, end_line: 2, content_hash: "h" });
    store.addEdge({
      source: "src/caller.ts::caller:2",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "shared:2:35", content_hash: "h" },
      created_at: 1,
    });
    const out = impact({ symbols: ["shared"], changeType: "signature_change", store, projectRoot, maxDepth: 3 });
    expect(out.trim().split("\n")).toHaveLength(1);
    expect(out.trim()).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?$/);
    // AC 11 strict contract: file:line:hash + two-space field separators + trailing newline.
    expect(out).toMatch(/^src\/caller\.ts:2:[0-9a-f]{4}  caller  breaking  depth:1( \[stale\])?\n$/);
    const noImpact = impact({ symbols: ["shared"], changeType: "addition", store, projectRoot, maxDepth: 3 });
    expect(noImpact).toBe("");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('pi extension default export registers tool name "impact" with symbols/changeType schema', async () => {
  const registeredTools: Array<{ name: string; parameters: unknown; execute: Function }> = [];
  const mockPi = { registerTool(tool: any) { registeredTools.push(tool); }, on() {} };
  const { default: piCodegraph } = await import("../src/index.js");
  expect(typeof piCodegraph).toBe("function");
  piCodegraph(mockPi as any);
  const impactTool = registeredTools.find((tool) => tool.name === "impact");
  expect(impactTool).toBeDefined();
  const schema = impactTool!.parameters as any;
  expect(schema.properties.symbols).toBeDefined();
  expect(schema.properties.changeType).toBeDefined();
  expect(schema.properties.maxDepth).toBeDefined();
});
```
**Step 2 — Run test and confirm RED**
```bash
bun test test/extension-impact.test.ts
```
Expected: `FAIL — Export named "impact" not found`

**Step 3 — Implement anchored output + tool wiring**
```ts
// src/tools/impact.ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
export type ChangeType = "signature_change" | "removal" | "behavior_change" | "addition";
export type ImpactClassification = "breaking" | "behavioral";

export interface CollectImpactParams {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  maxDepth?: number;
}
export interface ImpactItem {
  nodeId: string;
  name: string;
  file: string;
  depth: number;
  classification: ImpactClassification;
}
function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
  if (changeType === "addition") return null;
  if (changeType === "behavior_change") return "behavioral";
  if (changeType === "signature_change" || changeType === "removal") return depth === 1 ? "breaking" : "behavioral";
  return null;
}
export function collectImpact(params: CollectImpactParams): ImpactItem[] {
  const { symbols, changeType, store, maxDepth = 5 } = params;
  if (changeType === "addition") return [];
  const queue: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>();
  const results: ImpactItem[] = [];
  for (const symbol of symbols) {
    for (const node of store.findNodes(symbol)) {
      queue.push({ id: node.id, depth: 0 });
      seen.add(node.id);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const neighbor of store.getNeighbors(current.id, { direction: "in", kind: "calls" })) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({ nodeId: neighbor.node.id, name: neighbor.node.name, file: neighbor.node.file, depth, classification });
    }
  }
  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function impact(params: { symbols: string[]; changeType: ChangeType; store: GraphStore; projectRoot: string; maxDepth?: number }): string {
  const hits = collectImpact({ symbols: params.symbols, changeType: params.changeType, store: params.store, maxDepth: params.maxDepth });
  if (hits.length === 0) return "";
  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}`];
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  // keep trailing newline for non-empty result sets (tool output convention)
}
```

```ts
// src/index.ts — add this import after the existing tool imports at the top
import { impact } from "./tools/impact.js";

// src/index.ts — add after the existing ResolveEdgeParams constant
const ImpactParams = Type.Object({
  symbols: Type.Array(Type.String({ description: "Changed symbol name" }), {
    description: "One or more symbol names that changed",
  }),
  changeType: Type.Union(
    [
      Type.Literal("signature_change"),
      Type.Literal("removal"),
      Type.Literal("behavior_change"),
      Type.Literal("addition"),
    ],
    { description: "Kind of change" },
  ),
  maxDepth: Type.Optional(
    Type.Number({ description: "Maximum traversal depth (default 5)" }),
  ),
});

// src/index.ts — inside piCodegraph(), add after the resolve_edge registerTool block
  pi.registerTool({
    name: "impact",
    label: "Impact",
    description: "Given changed symbols, return downstream dependents classified by change type",
    parameters: ImpactParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      const text = impact({
        symbols: params.symbols,
        changeType: params.changeType,
        store,
        projectRoot,
        maxDepth: params.maxDepth,
      });
      return { content: [{ type: "text", text }], details: undefined };
    },
  });
```
**Step 4 — Re-run focused test (GREEN)**
```bash
bun test test/extension-impact.test.ts
```
Expected: PASS

**Step 5 — Verify no regressions**
```bash
bun test
```
Expected: All tests pass.
