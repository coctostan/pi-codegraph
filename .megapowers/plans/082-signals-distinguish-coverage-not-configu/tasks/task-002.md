---
id: 2
title: runCoverageIndexStage marks coverage indexed on every successful run
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/coverage.ts
files_to_create:
  - test/indexer-coverage-stage-mark-indexed.test.ts
---

Covers AC4. The stage must record `coverage_indexed = "1"` after running, even when zero `tested_by` edges are produced (e.g. coverage dir absent / empty). This is what distinguishes "no coverage configured" from "coverage ran, nothing covers this symbol".

**Files:**
- Modify: `src/indexer/coverage.ts`
- Create: `test/indexer-coverage-stage-mark-indexed.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runCoverageIndexStage } from "../src/indexer/coverage.js";

test("runCoverageIndexStage marks coverage indexed even when coverage dir is missing", () => {
  const projectRoot = join(tmpdir(), `pi-cg-covmark-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });
  const store = new SqliteGraphStore();
  try {
    expect(store.hasCoverageData()).toBe(false);
    runCoverageIndexStage(store, projectRoot, join(projectRoot, ".codegraph", "coverage"));
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("runCoverageIndexStage marks coverage indexed when coverage dir exists with no reports", () => {
  const projectRoot = join(tmpdir(), `pi-cg-covmark-empty-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(coverageDir, { recursive: true });
  const store = new SqliteGraphStore();
  try {
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("runCoverageIndexStage marks coverage indexed when reports exist but match no nodes", () => {
  const projectRoot = join(tmpdir(), `pi-cg-covmark-norec-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(coverageDir, { recursive: true });
  // coverage report references a file that has no nodes in the store
  writeFileSync(join(coverageDir, "report.json"), JSON.stringify({ result: [] }));
  const store = new SqliteGraphStore();
  try {
    runCoverageIndexStage(store, projectRoot, coverageDir);
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/indexer-coverage-stage-mark-indexed.test.ts`
Expected: FAIL — `expect(received).toBe(expected) ... Expected: true Received: false` (each test asserts `hasCoverageData()` becomes true after the stage runs but it stays false today).

**Step 3 — Write minimal implementation**

Edit `src/indexer/coverage.ts` `runCoverageIndexStage`. At the very end of the function (after the `for (const reportFile of reportNames)` loop closes, last line of the function), add:

```ts
  store.markCoverageIndexed();
```

Final shape:

```ts
export function runCoverageIndexStage(store: GraphStore, projectRoot: string, coverageDir: string): void {
  const normalized = parseCoverageReports(projectRoot, coverageDir);
  const mapped = mapCoverageToNodes(store, normalized);
  // ... existing grouping + edge/trace writes ...
  store.markCoverageIndexed();
}
```

This unconditionally records the sentinel for any successful (non-throwing) execution of the stage, including empty/missing coverage dirs — matching AC4.

**Step 4 — Run test, verify it passes**

Run: `bun test test/indexer-coverage-stage-mark-indexed.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing.
