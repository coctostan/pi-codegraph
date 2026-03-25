---
id: 7
title: "dead_code: single symbol mode — unreferenced and not-found/ambiguous"
status: approved
depends_on:
  - 6
no_test: false
files_to_modify: []
files_to_create:
  - test/tool-dead-code-single-unreferenced.test.ts
---

### Task 7: dead_code: single symbol mode — unreferenced and not-found/ambiguous [depends: 6]

**Files:**
- Create: `test/tool-dead-code-single-unreferenced.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-dead-code-single-unreferenced.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode single symbol reports unreferenced when no inbound edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-unref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function lonely() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::lonely:1", kind: "function", name: "lonely", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });

    const output = deadCode({ name: "lonely", store, projectRoot });

    expect(output).toContain("referenced: no");
    expect(output).toContain("references: 0");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode single symbol returns not-found for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-notfound-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const store = new SqliteGraphStore();
  try {
    const output = deadCode({ name: "nonexistent", store, projectRoot });
    expect(output).toContain("not found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode single symbol returns disambiguation list for ambiguous symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-ambig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileA = "export function dup() {}\n";
  const fileB = "export function dup() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);

  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.addNode({ id: "src/a.ts::dup:1", kind: "function", name: "dup", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::dup:1", kind: "function", name: "dup", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });

    const output = deadCode({ name: "dup", store, projectRoot });
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-dead-code-single-unreferenced.test.ts`
Expected: PASS — all three assertions are already satisfied by the Task 6 implementation.

Actually, this should pass immediately since the logic already handles these cases. Let me verify the assertions are correct against the implementation.

The `resolveUniqueSymbol` function already returns `not_found` and `ambiguous` cases, and the `inbound.length === 0` case already produces `referenced: no` and `references: 0`.

**Step 3 — No additional implementation needed**

The Task 6 implementation already handles unreferenced symbols (zero inbound edges → `referenced: no`, `references: 0`) and delegates to `resolveUniqueSymbol` for not-found and ambiguous cases.

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-dead-code-single-unreferenced.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
