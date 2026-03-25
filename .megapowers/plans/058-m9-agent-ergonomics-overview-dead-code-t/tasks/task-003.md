---
id: 3
title: "graph_overview: most-imported files"
status: approved
depends_on:
  - 2
no_test: false
files_to_modify:
  - src/tools/graph-overview.ts
files_to_create:
  - test/tool-graph-overview-imports.test.ts
---

### Task 3: graph_overview: most-imported files [depends: 2]

**Files:**
- Modify: `src/tools/graph-overview.ts`
- Create: `test/tool-graph-overview-imports.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-graph-overview-imports.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("graphOverview includes most-imported files sorted by import count", () => {
  const projectRoot = join(tmpdir(), `pi-cg-overview-imports-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileShared = "export function shared() {}\n";
  const fileCaller1 = "import { shared } from './shared';\nexport function c1() { shared(); }\n";
  const fileCaller2 = "import { shared } from './shared';\nexport function c2() { shared(); }\n";
  writeFileSync(join(projectRoot, "src/shared.ts"), fileShared);
  writeFileSync(join(projectRoot, "src/c1.ts"), fileCaller1);
  writeFileSync(join(projectRoot, "src/c2.ts"), fileCaller2);

  const store = new SqliteGraphStore();
  try {
    const hashS = sha256Hex(fileShared);
    const hash1 = sha256Hex(fileCaller1);
    const hash2 = sha256Hex(fileCaller2);
    store.setFileHash("src/shared.ts", hashS);
    store.setFileHash("src/c1.ts", hash1);
    store.setFileHash("src/c2.ts", hash2);

    store.addNode({ id: "src/shared.ts::shared:1", kind: "function", name: "shared", file: "src/shared.ts", start_line: 1, end_line: 1, content_hash: hashS, is_exported: true });
    store.addNode({ id: "src/c1.ts::c1:2", kind: "function", name: "c1", file: "src/c1.ts", start_line: 2, end_line: 2, content_hash: hash1, is_exported: true });
    store.addNode({ id: "src/c2.ts::c2:2", kind: "function", name: "c2", file: "src/c2.ts", start_line: 2, end_line: 2, content_hash: hash2, is_exported: true });

    // Both callers import from shared
    store.addEdge({ source: "src/c1.ts::c1:2", target: "src/shared.ts::shared:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hash1 }, created_at: Date.now() });
    store.addEdge({ source: "src/c2.ts::c2:2", target: "src/shared.ts::shared:1", kind: "imports", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hash2 }, created_at: Date.now() });

    const output = graphOverview({ store, projectRoot });

    expect(output).toContain("## Most-Imported Files");
    expect(output).toContain("src/shared.ts");
    // shared.ts has 2 inbound imports
    expect(output).toMatch(/src\/shared\.ts.*2/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-graph-overview-imports.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "..." to contain "## Most-Imported Files"`

**Step 3 — Write minimal implementation**

Add the most-imported files section to `graphOverview` in `src/tools/graph-overview.ts`, after the Hub Symbols section:

```typescript
  // Most-imported files section
  const importRows = store.queryRows<{ file: string; import_count: number }>(
    `SELECT n.file, COUNT(*) as import_count
     FROM edges e
     JOIN nodes n ON e.target = n.id
     WHERE e.kind = 'imports'
       AND NOT n.file LIKE '__meta__%'
       AND NOT n.file LIKE '__unresolved__%'
     GROUP BY n.file
     ORDER BY import_count DESC
     LIMIT 10`
  );
  if (importRows.length > 0) {
    lines.push("");
    lines.push("## Most-Imported Files");
    for (const row of importRows) {
      lines.push(`${row.file}  imports:${row.import_count}`);
    }
  }
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-graph-overview-imports.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
