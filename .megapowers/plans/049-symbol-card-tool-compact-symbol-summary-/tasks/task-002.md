---
id: 2
title: symbolCard returns disambiguation list for multiple matches
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
files_to_create:
  - test/tool-symbol-card-ambiguous.test.ts
---

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Test: `test/tool-symbol-card-ambiguous.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-ambiguous.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard returns disambiguation list when multiple nodes match", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() {}\n";
  const fileBContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);

  try {
    const store = new SqliteGraphStore();
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");
    // Should NOT contain card sections
    expect(output).not.toContain("### Signature");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-ambiguous.test.ts`
Expected: FAIL — expect(received).toContain(expected) — Expected string to contain "Multiple matches"

**Step 3 — Write minimal implementation**

In `src/tools/symbol-card.ts`, replace the stub after the `nodes.length === 0` check:

```ts
export function symbolCard(params: SymbolCardParams): string {
  const { name, file, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  // Single-match card rendering — next task
  return prependTrustHeader(`Symbol "${name}"`, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-ambiguous.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
