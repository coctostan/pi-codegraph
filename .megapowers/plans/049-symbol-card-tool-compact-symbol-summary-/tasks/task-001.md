---
id: 1
title: symbolCard returns not-found with trust header
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/tools/symbol-card.ts
  - test/tool-symbol-card-not-found.test.ts
---

**Files:**
- Create: `src/tools/symbol-card.ts`
- Test: `test/tool-symbol-card-not-found.test.ts`

**Step 1 — Write the failing test**

```ts
// test/tool-symbol-card-not-found.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";

test("symbolCard returns not-found message with trust header for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nf-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/a.ts"), "export function foo() {}\n");

  try {
    const store = new SqliteGraphStore();
    const output = symbolCard({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-card-not-found.test.ts`
Expected: FAIL — Cannot find module "../src/tools/symbol-card.js"

**Step 3 — Write minimal implementation**

```ts
// src/tools/symbol-card.ts
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
import { createSignalComputer, formatRoleTags } from "../output/signals.js";
import { prependTrustHeader } from "../output/trust.js";

export interface SymbolCardParams {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}

export function symbolCard(params: SymbolCardParams): string {
  const { name, file, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  // Disambiguation and card rendering added in subsequent tasks
  return prependTrustHeader(`Symbol "${name}" not found`, { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-card-not-found.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
