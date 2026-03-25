---
id: 11
title: symbolCard — neighbor signatures in Key Relationships
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
files_to_create:
  - test/tool-symbol-card-neighbor-sigs.test.ts
---

### Task 11: symbolCard — neighbor signatures in Key Relationships [depends: 6]

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Create: `test/tool-symbol-card-neighbor-sigs.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-card-neighbor-sigs.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows neighbor signatures in Key Relationships", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nbsig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() { bar(); }\n";
  const fileBContent = "export function bar(x: number): string { return String(x); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts",
      start_line: 1, end_line: 1, content_hash: hashA, is_exported: true,
      signature: "() => void",
    });
    store.addNode({
      id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts",
      start_line: 1, end_line: 1, content_hash: hashB, is_exported: true,
      signature: "(x: number) => string",
    });
    // foo calls bar
    store.addEdge({
      source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    // Neighbor signature should appear
    expect(output).toContain("(x: number) => string");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard omits signature line for neighbors without a signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nbnosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() { bar(); }\n";
  const fileBContent = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts",
      start_line: 1, end_line: 1, content_hash: hashA, is_exported: true,
    });
    // bar has NO signature
    store.addNode({
      id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts",
      start_line: 1, end_line: 1, content_hash: hashB, is_exported: true,
    });
    store.addEdge({
      source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    // Should NOT have "not available" for neighbor signature
    // Count occurrences of "not available" — only the foo's own signature section should have it
    const relSection = output.slice(output.indexOf("### Key Relationships"));
    expect(relSection).not.toContain("not available");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-neighbor-sigs.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected "(x: number) => string" to be in the output`

**Step 3 — Write minimal implementation**

Modify `formatRelGroup` in `src/tools/symbol-card.ts`:

```typescript
function formatRelGroup(label: string, neighbors: NeighborResult[]): string {
  const top = neighbors.slice(0, 5);
  const lines: string[] = [];
  const names = top.map((nr) => nr.node.name);
  const suffix = neighbors.length > 5 ? ` (+${neighbors.length - 5} more)` : "";
  lines.push(`  ${label} (${neighbors.length}):  ${names.join(", ")}${suffix}`);
  for (const nr of top) {
    if (nr.node.signature) {
      lines.push(`    ${nr.node.name}: ${nr.node.signature}`);
    }
  }
  return lines.join("\n");
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-neighbor-sigs.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all 387 tests passing
