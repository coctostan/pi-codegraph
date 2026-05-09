---
id: 6
title: Render symbol-resolution candidates with separate file context
status: approved
depends_on:
  - 2
  - 3
  - 5
no_test: false
files_to_modify:
  - src/tools/symbol-resolution.ts
  - src/tools/symbol-graph.ts
  - test/tool-impact-ambiguous.test.ts
  - test/tool-trace-ambiguous.test.ts
files_to_create:
  - test/tool-symbol-resolution-anchor-format.test.ts
---

Covers AC 10 and part of AC 15.

**Files:**
- Modify: `src/tools/symbol-resolution.ts`
- Modify: `src/tools/symbol-graph.ts`
- Modify: `test/tool-impact-ambiguous.test.ts`
- Modify: `test/tool-trace-ambiguous.test.ts`
- Create: `test/tool-symbol-resolution-anchor-format.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-resolution-anchor-format.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { formatAmbiguousMatches } from "../src/tools/symbol-resolution.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("formatAmbiguousMatches renders candidate files separately from editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-res-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() {}\n";
  const bContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  try {
    const output = formatAmbiguousMatches("foo", [
      { id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) },
      { id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) },
    ], projectRoot);

    expect(output).toContain('Multiple matches for "foo"');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
    expect(output).not.toContain("src/a.ts:1:");
    expect(output).not.toContain("src/b.ts:1:");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolGraph neighborhood ambiguity uses file-separated candidate anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() {}\n";
  const bContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) });

    const output = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });

    expect(output).toContain('Multiple matches for "foo"');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
    expect(output).not.toContain("src/a.ts:1:");
    expect(output).not.toContain("src/b.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update existing public ambiguity tests in the same task. In `test/tool-impact-ambiguous.test.ts` and `test/tool-trace-ambiguous.test.ts`, replace old assertions such as:

```ts
expect(output).toContain("src/hash.ts:1:");
expect(output).toContain("test/hash.test.ts:1:");
```

with:

```ts
expect(output).toMatch(/src\/hash\.ts  1:[0-9a-f]{3}/);
expect(output).toMatch(/test\/hash\.test\.ts  1:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/hash\.ts:1:[0-9a-f]{4}/);
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-resolution-anchor-format.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` with `Expected substring: "src/a.ts  1:c27  foo (function)"` because candidate rows still render the old `anchor  name  file` order.

**Step 3 — Write minimal implementation**
In `src/tools/symbol-resolution.ts`, update imports and rendering:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";

export function formatAmbiguousMatches(name: string, nodes: GraphNode[], projectRoot: string): string {
  const lines: string[] = [`Multiple matches for "${name}":`, ""];
  for (const node of nodes) {
    const anchor = computeAnchor(node, projectRoot);
    const staleMarker = anchor.stale ? " [stale]" : "";
    lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
  }
  return `${lines.join("\n")}\n`;
}
```

In `src/tools/symbol-graph.ts`, add `formatAnchorLocation` to the anchoring import:

```ts
import {
  computeAnchor,
  rankNeighbors,
  formatNeighborhood,
  formatAnchorLocation,
  type AnchoredNeighbor,
  type NeighborSection,
  type NamedSection,
} from "../output/anchoring.js";
```

Then update the `renderLegacyNeighborhoodBody(...)` ambiguity row:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
```

Also update `test/tool-impact-ambiguous.test.ts` and `test/tool-trace-ambiguous.test.ts` to the new candidate row shape so the task-local and full-suite gates both pass.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-resolution-anchor-format.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
