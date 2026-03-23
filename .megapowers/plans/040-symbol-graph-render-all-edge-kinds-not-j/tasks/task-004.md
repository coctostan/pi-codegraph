---
id: 4
title: "Future-proof: unknown edge kinds render with generic section title"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-symbol-graph-unknown-edge-kind.test.ts
---

**AC coverage:** AC 10

**Files:**
- Create: `test/tool-symbol-graph-unknown-edge-kind.test.ts`

**Step 1 — Write the failing test**

Create `test/tool-symbol-graph-unknown-edge-kind.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

test("symbolGraph renders unknown edge kind with generic title instead of dropping it", () => {
  const projectRoot = join(tmpdir(), `pi-cg-unknown-edge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "export function alpha() {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export function beta() {}\n",
  );

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const hashA = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/a.ts"), "utf-8"));
    const hashB = sha256Hex(require("node:fs").readFileSync(join(projectRoot, "src/b.ts"), "utf-8"));

    store.addNode({ id: "src/a.ts::alpha:1", kind: "function", name: "alpha", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA });
    store.addNode({ id: "src/b.ts::beta:1", kind: "function", name: "beta", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB });

    // Use a hypothetical future edge kind by casting
    store.addEdge({
      source: "src/a.ts::alpha:1",
      target: "src/b.ts::beta:1",
      kind: "delegates_to" as any,
      provenance: { source: "agent", confidence: 0.8, evidence: "agent-written", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "alpha", store, projectRoot });

    // Should NOT silently drop the edge
    expect(output).toContain("beta");
    // Should render a generic title derived from the kind
    expect(output).toContain("Delegates To");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/tool-symbol-graph-unknown-edge-kind.test.ts`

Expected: PASS — This should already pass because the `sectionTitle` default case in Task 2's implementation handles unknown kinds by deriving a title from the kind string. This test exists to guard the behavior.

**Step 3 — Write minimal implementation**

No additional production code needed. The `default` case in `sectionTitle()` (added in Task 2) already handles this:

```typescript
default: {
  const label = edgeKind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return direction === "in" ? `${label} (incoming)` : `${label} (outgoing)`;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/tool-symbol-graph-unknown-edge-kind.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: all passing
