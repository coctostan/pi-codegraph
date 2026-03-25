---
id: 6
title: "dead_code: single symbol mode — referenced symbol"
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/dead-code.ts
  - test/tool-dead-code-single-referenced.test.ts
---

### Task 6: dead_code: single symbol mode — referenced symbol

**Files:**
- Create: `src/tools/dead-code.ts`
- Create: `test/tool-dead-code-single-referenced.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-single-referenced.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode single symbol mode reports referenced symbol with reference list", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-ref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function target() {}\n";
  const fileB = "import { target } from './a';\nexport function caller() { target(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::target:1", kind: "function", name: "target", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::caller:2", kind: "function", name: "caller", file: "src/b.ts", start_line: 2, end_line: 2, content_hash: hashB, is_exported: true });

    store.addEdge({ source: "src/b.ts::caller:2", target: "src/a.ts::target:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashB }, created_at: Date.now() });
    store.addEdge({ source: "src/b.ts::caller:2", target: "src/a.ts::target:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashB }, created_at: Date.now() });

    const output = deadCode({ name: "target", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("referenced: yes");
    expect(output).toContain("references: 2");
    expect(output).toContain("caller");
    expect(output).toContain("calls");
    expect(output).toContain("imports");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-single-referenced.test.ts`
Expected: FAIL — `error: Cannot find module "../src/tools/dead-code.js"`

**Step 3 — Write minimal implementation**

```typescript
// src/tools/dead-code.ts
import type { GraphStore } from "../graph/store.js";
import type { NodeKind } from "../graph/types.js";
import { prependTrustHeader } from "../output/trust.js";
import { resolveUniqueSymbol } from "./symbol-resolution.js";

export interface DeadCodeParams {
  name?: string;
  file?: string;
  kind?: string;
  glob?: string;
  store: GraphStore;
  projectRoot: string;
}

export function deadCode(params: DeadCodeParams): string {
  const { name, file, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  if (name) {
    return singleSymbolMode({ name, file, store, projectRoot, stats });
  }

  return prependTrustHeader("sweep mode not yet implemented", { stats });
}

function singleSymbolMode(params: {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
  stats: ReturnType<GraphStore["getStatistics"]>;
}): string {
  const { name, file, store, projectRoot, stats } = params;

  const resolved = resolveUniqueSymbol({
    name,
    file,
    store,
    projectRoot,
    notFoundLabel: "Symbol",
  });

  if (resolved.kind === "not_found") {
    return prependTrustHeader(resolved.text, { stats });
  }
  if (resolved.kind === "ambiguous") {
    return prependTrustHeader(resolved.text, { stats });
  }

  const node = resolved.node;
  const inbound = store.getNeighbors(node.id, { direction: "in" })
    .filter((nr) => !nr.node.file.startsWith("__meta__") && !nr.node.file.startsWith("__unresolved__"));

  const lines: string[] = [];
  lines.push(`## ${node.name} (${node.kind})`);
  lines.push(`file: ${node.file}`);
  lines.push(`referenced: ${inbound.length > 0 ? "yes" : "no"}`);
  lines.push(`references: ${inbound.length}`);

  if (inbound.length > 0) {
    lines.push("");
    for (const nr of inbound) {
      lines.push(`  ${nr.node.name}  ${nr.node.kind}  ${nr.node.file}  ${nr.edge.kind}`);
    }
  }

  return prependTrustHeader(lines.join("\n") + "\n", { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-single-referenced.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
