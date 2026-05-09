---
id: 7
title: Render symbol card anchors with separate file context
status: approved
depends_on:
  - 2
  - 3
  - 5
no_test: false
files_to_modify:
  - src/tools/symbol-card.ts
  - src/tools/symbol-contract.ts
  - test/tool-symbol-card-happy.test.ts
  - test/tool-symbol-contract-happy.test.ts
files_to_create:
  - test/tool-symbol-card-anchor-format.test.ts
---

Covers AC 10 for `symbolGraph` default/card output and part of AC 15.

**Files:**
- Modify: `src/tools/symbol-card.ts`
- Modify: `src/tools/symbol-contract.ts`
- Create: `test/tool-symbol-card-anchor-format.test.ts`
- Modify: `test/tool-symbol-card-happy.test.ts`
- Modify: `test/tool-symbol-contract-happy.test.ts`

**Step 1 — Write the failing test**
Create `test/tool-symbol-card-anchor-format.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("symbolGraph default card renders file-separated editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-card-public-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(content), signature: "() => void" });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    expect(output).toContain("## foo (function)");
    expect(output).toContain("src/foo.ts  1:c27");
    expect(output).not.toContain("src/foo.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard and symbolContract render file-separated anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-card-contract-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(content), signature: "() => void" });

    const card = symbolCard({ name: "foo", store, projectRoot });
    const contract = symbolContract({ name: "foo", store, projectRoot });

    expect(card).toContain("src/foo.ts  1:c27");
    expect(contract).toContain("src/foo.ts  1:c27");
    expect(card).not.toContain("src/foo.ts:1:");
    expect(contract).not.toContain("src/foo.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Update existing card/contract happy-path tests in this task as well. Replace old assertions such as:

```ts
expect(output).toContain("src/a.ts:3:");
expect(output).toContain("src/validate.ts:1:");
```

with:

```ts
expect(output).toMatch(/src\/a\.ts  3:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/a\.ts:3:[0-9a-f]{4}/);
expect(output).toMatch(/src\/validate\.ts  1:[0-9a-f]{3}/);
expect(output).not.toMatch(/src\/validate\.ts:1:[0-9a-f]{4}/);
```

Run: `bun test test/tool-symbol-card-anchor-format.test.ts`
Expected: FAIL — `expect(received).toContain(expected)` with `Expected substring: "src/foo.ts  1:c27"` because card and contract headers still render only `anchor.anchor`.

**Step 3 — Write minimal implementation**
In `src/tools/symbol-card.ts`, import the formatter:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Replace every rendered direct anchor location with `formatAnchorLocation(...)`, including ambiguity rows, card headers, and covering test rows:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
lines.push(formatAnchorLocation(anchor));
lines.push(`  ${formatAnchorLocation(testAnchor)}  "${t.node.name}"`);
```

Apply those replacements in `renderSymbolSourceSection(...)`, `renderSymbolCardBody(...)`, and `symbolCard(...)`.

In `src/tools/symbol-contract.ts`, import the formatter:

```ts
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
```

Replace contract ambiguity and header rows:

```ts
lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
lines.push(formatAnchorLocation(anchor));
```

Also update `test/tool-symbol-card-happy.test.ts` and `test/tool-symbol-contract-happy.test.ts` to remove old `file:line:hash` assertions for this surface before running the full suite.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-anchor-format.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: PASS — all tests passing.
