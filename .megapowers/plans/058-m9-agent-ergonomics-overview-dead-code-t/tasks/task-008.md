---
id: 8
title: "dead_code: sweep mode — exported symbols with zero inbound edges"
status: approved
depends_on:
  - 6
no_test: false
files_to_modify:
  - src/tools/dead-code.ts
files_to_create:
  - test/tool-dead-code-sweep.test.ts
---

### Task 8: dead_code: sweep mode — exported symbols with zero inbound edges [depends: 6]

**Files:**
- Modify: `src/tools/dead-code.ts`
- Create: `test/tool-dead-code-sweep.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-sweep.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode sweep mode finds exported symbols with zero inbound edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function used() {}\n";
  const fileB = "export function unused() {}\n";
  const fileC = "import { used } from './a';\nexport function caller() { used(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  writeFileSync(join(projectRoot, "src/c.ts"), fileC);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    const hashC = sha256Hex(fileC);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.setFileHash("src/c.ts", hashC);

    store.addNode({ id: "src/a.ts::used:1", kind: "function", name: "used", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::unused:1", kind: "function", name: "unused", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    store.addNode({ id: "src/c.ts::caller:2", kind: "function", name: "caller", file: "src/c.ts", start_line: 2, end_line: 2, content_hash: hashC, is_exported: true });

    // caller calls used — used has inbound edge
    store.addEdge({ source: "src/c.ts::caller:2", target: "src/a.ts::used:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashC }, created_at: Date.now() });

    const output = deadCode({ store, projectRoot });

    expect(output).toContain("## Trust");
    // unused and caller have zero inbound edges, used has one
    expect(output).toContain("unused");
    expect(output).toContain("caller");
    expect(output).not.toContain("used  function  src/a.ts"); // used has references
    // Non-exported symbols should not appear
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode excludes non-exported symbols", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-noexport-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "function internal() {}\nexport function exported() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);

    store.addNode({ id: "src/a.ts::internal:1", kind: "function", name: "internal", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: false });
    store.addNode({ id: "src/a.ts::exported:2", kind: "function", name: "exported", file: "src/a.ts", start_line: 2, end_line: 2, content_hash: hashA, is_exported: true });

    const output = deadCode({ store, projectRoot });

    // Only exported should appear
    expect(output).toContain("exported");
    expect(output).not.toContain("internal");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode sorts by file then name", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-sort-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function zeta() {}\nexport function alpha() {}\n";
  const fileB = "export function beta() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::zeta:1", kind: "function", name: "zeta", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/a.ts::alpha:2", kind: "function", name: "alpha", file: "src/a.ts", start_line: 2, end_line: 2, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::beta:1", kind: "function", name: "beta", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = deadCode({ store, projectRoot });

    // src/a.ts comes before src/b.ts; within a.ts, alpha before zeta
    const alphaIdx = output.indexOf("alpha");
    const zetaIdx = output.indexOf("zeta");
    const betaIdx = output.indexOf("beta");
    expect(alphaIdx).toBeLessThan(zetaIdx);
    expect(zetaIdx).toBeLessThan(betaIdx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-sweep.test.ts`
Expected: FAIL — `expect(received).toContain(expected) — Expected string "...sweep mode not yet implemented..." to contain "unused"`

**Step 3 — Write minimal implementation**

Replace the sweep mode placeholder in `src/tools/dead-code.ts`:

```typescript
// In deadCode function, replace the sweep mode fallback:
export function deadCode(params: DeadCodeParams): string {
  const { name, file, kind, glob, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);

  if (name) {
    return singleSymbolMode({ name, file, store, projectRoot, stats });
  }

  return sweepMode({ kind, glob, store, projectRoot, stats });
}

function sweepMode(params: {
  kind?: string;
  glob?: string;
  store: GraphStore;
  projectRoot: string;
  stats: ReturnType<GraphStore["getStatistics"]>;
}): string {
  const { kind, glob, store, projectRoot, stats } = params;

  // Find all exported nodes with zero inbound edges
  let sql = `
    SELECT n.id, n.name, n.kind, n.file
    FROM nodes n
    WHERE n.is_exported = 1
      AND NOT n.file LIKE '__meta__%'
      AND NOT n.file LIKE '__unresolved__%'
      AND NOT EXISTS (
        SELECT 1 FROM edges e
        WHERE e.target = n.id
          AND e.source NOT LIKE '__meta__%'
          AND e.source NOT LIKE '__unresolved__%'
      )
  `;

  const sqlParams: unknown[] = [];

  if (kind) {
    sql += " AND n.kind = ?";
    sqlParams.push(kind);
  }

  if (glob) {
    // Convert simple glob to SQL LIKE: src/tools/* -> src/tools/%
    const likePattern = glob.replace(/\*/g, "%");
    sql += " AND n.file LIKE ?";
    sqlParams.push(likePattern);
  }

  sql += " ORDER BY n.file ASC, n.name ASC";

  const rows = store.queryRows<{ id: string; name: string; kind: string; file: string }>(sql, sqlParams);

  if (rows.length === 0) {
    return prependTrustHeader("No unreferenced exported symbols found.\n", { stats });
  }

  const lines: string[] = [];
  lines.push(`## Unreferenced Exported Symbols (${rows.length})`);
  lines.push("");
  for (const row of rows) {
    lines.push(`${row.name}  ${row.kind}  ${row.file}`);
  }

  return prependTrustHeader(lines.join("\n") + "\n", { stats });
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-sweep.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
