---
id: 3
title: Make impact reject ambiguous symbol seeds
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/tools/impact.ts
files_to_create:
  - test/tool-impact-ambiguous.test.ts
---

### Task 3: Make impact reject ambiguous symbol seeds [depends: 2]

**Files:**
- Create: `test/tool-impact-ambiguous.test.ts`
- Modify: `src/tools/impact.ts`
- Test: `test/tool-impact-ambiguous.test.ts`

**Step 1 — Write the failing test**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("impact returns a disambiguation list instead of aggregating all ambiguous symbol matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-ambiguous-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const prodContent = "export function sha256Hex() { return 'prod'; }\n";
  const helperContent = "export function sha256Hex() { return 'helper'; }\n";
  const callerContent = "export function caller() { return sha256Hex(); }\n";
  writeFileSync(join(projectRoot, "src", "hash.ts"), prodContent);
  writeFileSync(join(projectRoot, "test", "hash.test.ts"), helperContent);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerContent);

  const store = new SqliteGraphStore();
  try {
    const prodNode = {
      id: "src/hash.ts::sha256Hex:1",
      kind: "function" as const,
      name: "sha256Hex",
      file: "src/hash.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(prodContent),
    };
    const testNode = {
      id: "test/hash.test.ts::sha256Hex:1",
      kind: "function" as const,
      name: "sha256Hex",
      file: "test/hash.test.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(helperContent),
    };
    const callerNode = {
      id: "src/caller.ts::caller:1",
      kind: "function" as const,
      name: "caller",
      file: "src/caller.ts",
      start_line: 1,
      end_line: 1,
      content_hash: sha256Hex(callerContent),
    };

    store.addNode(prodNode);
    store.addNode(testNode);
    store.addNode(callerNode);
    store.addEdge({
      source: callerNode.id,
      target: prodNode.id,
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "sha256Hex", content_hash: sha256Hex(callerContent) },
      created_at: 1,
    });

    const output = impact({
      symbols: ["sha256Hex"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 3,
    });

    expect(output).toContain('Multiple matches for "sha256Hex"');
    expect(output).toContain("src/hash.ts:1:");
    expect(output).toContain("test/hash.test.ts:1:");
    expect(output).not.toContain("caller  breaking  depth:1");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-impact-ambiguous.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` because `impact()` currently returns blended impact output like `caller  breaking  depth:1` instead of an ambiguity/disambiguation message.

**Step 3 — Write minimal implementation**
Replace `src/tools/impact.ts` with the version below. Keep `collectImpact()` on its existing `symbols: string[]` contract because it is already part of the tested surface in `test/tool-impact.test.ts`; this task only changes the user-facing ambiguity semantics of `impact()`.
```ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";
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
  if (changeType === "signature_change" || changeType === "removal") {
    return depth === 1 ? "breaking" : "behavioral";
  }
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

    const inbound = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
    for (const neighbor of inbound) {
      if (seen.has(neighbor.node.id)) continue;
      const depth = current.depth + 1;
      seen.add(neighbor.node.id);
      queue.push({ id: neighbor.node.id, depth });
      const classification = classify(changeType, depth);
      if (!classification) continue;
      results.push({
        nodeId: neighbor.node.id,
        name: neighbor.node.name,
        file: neighbor.node.file,
        depth,
        classification,
      });
    }
  }

  return results.sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

export function impact(params: {
  symbols: string[];
  changeType: ChangeType;
  store: GraphStore;
  projectRoot: string;
  maxDepth?: number;
}): string {
  for (const symbol of params.symbols) {
    const resolved = resolveUniqueSymbol({
      name: symbol,
      store: params.store,
      projectRoot: params.projectRoot,
      notFoundLabel: "Symbol",
    });
    if (resolved.kind === "ambiguous") return resolved.text;
    if (resolved.kind === "not_found") return "";
  }

  const hits = collectImpact({
    symbols: params.symbols,
    changeType: params.changeType,
    store: params.store,
    maxDepth: params.maxDepth,
  });
  if (hits.length === 0) return "";

  const lines = hits.flatMap((hit) => {
    const node = params.store.getNode(hit.nodeId);
    if (!node) return [];
    const { anchor, stale } = computeAnchor(node, params.projectRoot);
    return [`${anchor}  ${hit.name}  ${hit.classification}  depth:${hit.depth}${stale ? " [stale]" : ""}`];
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-impact-ambiguous.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
