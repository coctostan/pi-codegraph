---
id: 7
title: "End-to-end regression: freshly indexed graph with no coverage emits
  coverage-unknown"
status: approved
depends_on:
  - 2
  - 5
  - 6
no_test: false
files_to_modify: []
files_to_create:
  - test/signals-coverage-unknown-fresh-index.test.ts
---

Covers O2 + acts as the explicit AC6 regression. Pins the discrimination the issue requires:
- A manually-populated store (no stage ever ran) emits `coverage-unknown`.
- A freshly-indexed project without any coverage reports emits `untested`, because per AC4 the coverage stage runs on every `indexProject` and marks coverage indexed even when zero `tested_by` edges are produced.

Depends on Task 2 (stage marks indexed), Task 5 (`formatRoleTags` three-state), and Task 6 (`formatImpactWhy` three-state — needed only so the full suite stays green at Step 5).

**Files:**
- Create: `test/signals-coverage-unknown-fresh-index.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
import { createSignalComputer, formatRoleTags } from "../src/output/signals.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("manually-populated store with no coverage stage emits coverage-unknown", () => {
  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/x.ts::fn:1",
      kind: "function",
      name: "fn",
      file: "src/x.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "h",
      is_exported: true,
    });
    const signals = createSignalComputer(store).compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(false);
    expect(formatRoleTags(signals)).toContain("coverage-unknown");
  } finally {
    store.close();
  }
});

test("freshly indexed project without coverage reports emits untested (coverage stage ran with no data)", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-fresh-cov-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function fn() { return 1; }\n",
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(projectRoot, store, { lspClientFactory: () => fakeClient });
    expect(store.hasCoverageData()).toBe(true);

    const fn = store.findNodes("fn", "src/app.ts")[0]!;
    const signals = createSignalComputer(store).compute(fn.id);
    expect(signals.coverageKnown).toBe(true);
    expect(signals.tested).toBe(false);
    expect(formatRoleTags(signals)).toContain("untested");
    expect(formatRoleTags(signals)).not.toContain("coverage-unknown");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/signals-coverage-unknown-fresh-index.test.ts`

If executed before Task 5 lands, expected FAIL — `expect(received).toContain(expected) ... Expected substring: "coverage-unknown" Received: "[entry-point, untested]"` (manually-built fixture path).

If executed after Tasks 1–6 are all merged, the test passes immediately because every behavior it asserts is already implemented. The task is still kept as the explicit regression that locks both states; this is the intent of the AC6/O2 traceability.

**Step 3 — Write minimal implementation**

No production code change here. Tasks 1–6 already supply: `markCoverageIndexed()` (T1), stage marks coverage (T2), `coverageKnown` field (T3), fixtures prepared (T4), `formatRoleTags` three-state (T5), `formatImpactWhy` three-state (T6). If this test fails, the failure indicates one of those earlier tasks regressed — fix the offending earlier task and rerun, do not patch behavior here.

**Step 4 — Run test, verify it passes**

Run: `bun test test/signals-coverage-unknown-fresh-index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing.
