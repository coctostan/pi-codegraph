---
id: 9
title: "dead_code: sweep mode filtering by kind and glob"
status: approved
depends_on:
  - 8
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-dead-code-sweep-filters.test.ts
---

### Task 9: dead_code: sweep mode filtering by kind and glob [depends: 8]

**Files:**
- Create: `test/tool-dead-code-sweep-filters.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-sweep-filters.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode sweep mode filters by kind", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-filter-kind-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function foo() {}\n";
  const fileB = "export class Bar {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);

    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::Bar:1", kind: "class", name: "Bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Filter by kind=function — only foo should appear
    const output = deadCode({ kind: "function", store, projectRoot });
    expect(output).toContain("foo");
    expect(output).not.toContain("Bar");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode filters by glob", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-filter-glob-${Date.now()}`);
  mkdirSync(join(projectRoot, "src/tools"), { recursive: true });
  mkdirSync(join(projectRoot, "src/graph"), { recursive: true });

  const fileA = "export function toolFn() {}\n";
  const fileB = "export function graphFn() {}\n";
  writeFileSync(join(projectRoot, "src/tools/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/graph/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/tools/a.ts", hashA);
    store.setFileHash("src/graph/b.ts", hashB);

    store.addNode({ id: "src/tools/a.ts::toolFn:1", kind: "function", name: "toolFn", file: "src/tools/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/graph/b.ts::graphFn:1", kind: "function", name: "graphFn", file: "src/graph/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    // Filter by glob=src/tools/* — only toolFn should appear
    const output = deadCode({ glob: "src/tools/*", store, projectRoot });
    expect(output).toContain("toolFn");
    expect(output).not.toContain("graphFn");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode returns empty message when no matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-filter-empty-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = deadCode({ store, projectRoot });
    expect(output).toContain("No unreferenced exported symbols found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-sweep-filters.test.ts`
Expected: PASS — the filtering logic was already implemented in Task 8.

**Step 3 — No additional implementation needed**

The kind and glob filtering was already built into the sweep mode SQL in Task 8. This task validates those code paths.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-sweep-filters.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
