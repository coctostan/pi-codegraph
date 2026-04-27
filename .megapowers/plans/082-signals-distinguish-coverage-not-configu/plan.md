# Plan

### Task 1: Add hasCoverageData / markCoverageIndexed to GraphStore + SqliteGraphStore

Covers AC1, AC2, AC3.

Add a tiny generic `graph_metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL)` table to SQLite, then expose `hasCoverageData()` and `markCoverageIndexed()` through both the `GraphStore` interface and `SqliteGraphStore`. The state must survive close + reopen.

**Files:**
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Create: `test/graph-store-coverage-metadata.test.ts`

**Step 1 — Write the failing test**

Create `test/graph-store-coverage-metadata.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

test("SqliteGraphStore.hasCoverageData starts false and toggles true after markCoverageIndexed", () => {
  const store = new SqliteGraphStore();
  try {
    expect(store.hasCoverageData()).toBe(false);
    store.markCoverageIndexed();
    expect(store.hasCoverageData()).toBe(true);
    // idempotent
    store.markCoverageIndexed();
    expect(store.hasCoverageData()).toBe(true);
  } finally {
    store.close();
  }
});

test("SqliteGraphStore.hasCoverageData persists across close + reopen", () => {
  const dir = join(tmpdir(), `pi-cg-cov-meta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "graph.db");
  try {
    const a = new SqliteGraphStore(dbPath);
    expect(a.hasCoverageData()).toBe(false);
    a.markCoverageIndexed();
    a.close();

    const b = new SqliteGraphStore(dbPath);
    try {
      expect(b.hasCoverageData()).toBe(true);
    } finally {
      b.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/graph-store-coverage-metadata.test.ts`
Expected: FAIL — `TypeError: store.hasCoverageData is not a function` (and `markCoverageIndexed is not a function`).

**Step 3 — Write minimal implementation**

In `src/graph/store.ts`, add to the `GraphStore` interface (after `queryRows<T...>` and before `close()`):

```ts
  hasCoverageData(): boolean;
  markCoverageIndexed(): void;
```

In `src/graph/sqlite.ts`, inside `initSchema()` after the existing `CREATE TABLE IF NOT EXISTS test_trace_steps (...)` block and before `CREATE TABLE IF NOT EXISTS schema_version`, add to the same `this.db.exec(`...`)` SQL:

```sql
      CREATE TABLE IF NOT EXISTS graph_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
```

Then add two methods to the `SqliteGraphStore` class (e.g. just before `close()`):

```ts
  hasCoverageData(): boolean {
    const row = this.db
      .prepare(`SELECT value FROM graph_metadata WHERE key = ?`)
      .get("coverage_indexed") as { value: string } | null;
    return row?.value === "1";
  }

  markCoverageIndexed(): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO graph_metadata (key, value) VALUES (?, ?)`)
      .run("coverage_indexed", "1");
  }
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/graph-store-coverage-metadata.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing.

### Task 2: runCoverageIndexStage marks coverage indexed on every successful run [depends: 1]

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

### Task 3: Extend NodeSignals with coverageKnown wired from store.hasCoverageData() [depends: 1]

Covers AC1 wiring + supports AC6/AC7. Adds a new `coverageKnown: boolean` field on `NodeSignals` populated from `store.hasCoverageData()`. Format functions are NOT changed in this task.

**Files:**
- Modify: `src/output/signals.ts`
- Create: `test/output-signals-coverage-known.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { createSignalComputer } from "../src/output/signals.js";

function makeStoreWithFn() {
  const store = new SqliteGraphStore();
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
  return store;
}

test("NodeSignals.coverageKnown is false when store has no coverage data", () => {
  const store = makeStoreWithFn();
  try {
    const computer = createSignalComputer(store);
    const signals = computer.compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(false);
    expect(signals.tested).toBe(false);
  } finally {
    store.close();
  }
});

test("NodeSignals.coverageKnown is true when store.markCoverageIndexed() was called", () => {
  const store = makeStoreWithFn();
  try {
    store.markCoverageIndexed();
    const computer = createSignalComputer(store);
    const signals = computer.compute("src/x.ts::fn:1");
    expect(signals.coverageKnown).toBe(true);
    expect(signals.tested).toBe(false);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-signals-coverage-known.test.ts`
Expected: FAIL — `expect(received).toBe(expected) ... Expected: false Received: undefined` (the `coverageKnown` field does not yet exist on `NodeSignals`).

**Step 3 — Write minimal implementation**

In `src/output/signals.ts`:

1. Add the new field on `NodeSignals` (after `tested: boolean;`):
```ts
  coverageKnown: boolean;
```

2. Inside `createSignalComputer`, capture coverage state once per computer (it does not depend on nodeId):
```ts
  const coverageKnown = store.hasCoverageData();
```
Place this near the other top-level `const` declarations inside `createSignalComputer`.

3. In the cached `base` builder block, include `coverageKnown` in `built`:
```ts
        const built = {
          roles: sortRoles(roles, ROLE_ORDER),
          fanIn,
          fanOut,
          tested,
          frameworkMediated,
          isExported,
          coverageKnown,
        };
```

4. Update the `Omit<NodeSignals, "coChangeScore">` cache type — already correct since we only omit `coChangeScore` and now include `coverageKnown` in the base shape.

5. In the empty-node fallback (when `store.getNode(nodeId)` returns null) add `coverageKnown: false` to the returned object.

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-signals-coverage-known.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing. (Existing tests do not reference `coverageKnown`; format functions unchanged here.)

### Task 4: Mark coverage indexed in existing manual-store fixtures (test prep) [no-test] [depends: 1]

[no-test] Test-fixture preparation. Runs BEFORE the format-function changes (Tasks 5 and 6) so the suite stays green when those format functions change.

**Justification:** Pure test-fixture preparation. After this task, every fixture that manually builds a `SqliteGraphStore` and asserts `untested` / `coverage:untested` in later tests will explicitly call `store.markCoverageIndexed()` (added in Task 1). This is a no-op against today's `formatRoleTags` / `formatImpactWhy` (they ignore `coverageKnown`), so the suite stays green here. Tasks 5 and 6 then change the format functions, and the suite stays green because these fixtures already have coverage marked. `tool-impact-ranking.test.ts` is intentionally NOT in the list: its `compareDetails` reads only `signals.tested` (boolean), so the ordering assertions hold regardless of `coverageKnown`.

**Files (all modify):**
- `test/output-signals.test.ts`
- `test/tool-symbol-graph-signals.test.ts`
- `test/tool-impact-output-signals.test.ts`
- `test/tool-trace-signals.test.ts`
- `test/extension-readonly-trust-gating.test.ts`

**Step 1 — Apply the change**

In each file below, immediately after `const store = new SqliteGraphStore(...)` and inside the same `try { ... }` block (before any nodes/edges are added), add:

```ts
    store.markCoverageIndexed();
```

Specific insertion sites:

1. `test/output-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 27 (inside `"createSignalComputer computes AC-aligned ..."`).
2. `test/tool-symbol-graph-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 23.
3. `test/tool-impact-output-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 15.
4. `test/tool-trace-signals.test.ts` — after `const store = new SqliteGraphStore();` near line 16.
5. `test/extension-readonly-trust-gating.test.ts` — inside `populateStore`, after `const store = new SqliteGraphStore(dbPath);` near line 45 (before the existing `extractFile` call).

Do NOT modify any assertions or any other lines.

**Step 2 — Verify**

Run: `bun test && bun run check`
Expected: all passing. No assertions changed; `coverageKnown` is recorded on each store but the existing format functions still ignore it. Fixtures are now ready for Tasks 5 and 6.

### Task 5: formatRoleTags renders coverage-unknown when coverage data is absent [depends: 3, 4]

Covers AC5/AC6/AC7 for `formatRoleTags`. The trailing coverage token must become:
- `tested` when `signals.tested === true`
- `untested` when `signals.tested === false && signals.coverageKnown === true`
- `coverage-unknown` when `signals.tested === false && signals.coverageKnown === false`

Depends on Task 3 (adds `coverageKnown` to `NodeSignals`) and Task 4 (every existing manually-built-store fixture has already called `store.markCoverageIndexed()`, so its `untested` assertions still hold after this change).

**Files:**
- Modify: `src/output/signals.ts`
- Create: `test/output-signals-format-coverage-unknown.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { formatRoleTags, type NodeSignals } from "../src/output/signals.js";

const base: NodeSignals = {
  roles: ["leaf"],
  fanIn: 0,
  fanOut: 0,
  tested: false,
  frameworkMediated: false,
  isExported: false,
  coChangeScore: 0,
  coverageKnown: false,
};

test("formatRoleTags emits coverage-unknown when coverage is not indexed", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: false })).toBe(
    "[leaf, coverage-unknown]",
  );
});

test("formatRoleTags emits untested when coverage is indexed but symbol has no tested_by edge", () => {
  expect(formatRoleTags({ ...base, tested: false, coverageKnown: true })).toBe(
    "[leaf, untested]",
  );
});

test("formatRoleTags emits tested when symbol has a tested_by edge regardless of coverageKnown", () => {
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: false })).toBe(
    "[leaf, tested]",
  );
  expect(formatRoleTags({ ...base, tested: true, coverageKnown: true })).toBe(
    "[leaf, tested]",
  );
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-signals-format-coverage-unknown.test.ts`
Expected: FAIL — `Expected: "[leaf, coverage-unknown]" Received: "[leaf, untested]"` (current `formatRoleTags` always emits `untested` when `tested === false`).

**Step 3 — Write minimal implementation**

In `src/output/signals.ts`, replace `formatRoleTags`:

```ts
export function formatRoleTags(signals: NodeSignals): string {
  const coverageTag = signals.tested
    ? "tested"
    : signals.coverageKnown
      ? "untested"
      : "coverage-unknown";
  const tags = [...sortRoles(signals.roles, ROLE_ORDER), coverageTag];
  return `[${tags.join(", ")}]`;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-signals-format-coverage-unknown.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing. Task 4 has already added `store.markCoverageIndexed()` to every existing fixture that asserts `untested`, so those assertions continue to hold.

### Task 6: formatImpactWhy renders coverage:unknown when coverage data is absent [depends: 3, 4]

Covers AC5/AC6/AC7 for `formatImpactWhy`. The `coverage:` segment must mirror the role-tag logic:
- `coverage:tested` when `tested === true`
- `coverage:untested` when `!tested && coverageKnown`
- `coverage:unknown` when `!tested && !coverageKnown`

Depends on Task 3 (`coverageKnown`) and Task 4 (existing fixtures have already marked coverage).

**Files:**
- Modify: `src/output/signals.ts`
- Create: `test/output-signals-impact-why-coverage-unknown.test.ts`

**Step 1 — Write the failing test**

```ts
import { expect, test } from "bun:test";
import { formatImpactWhy, type NodeSignals } from "../src/output/signals.js";

const base: NodeSignals = {
  roles: ["leaf"],
  fanIn: 0,
  fanOut: 1,
  tested: false,
  frameworkMediated: false,
  isExported: false,
  coChangeScore: 0,
  coverageKnown: false,
};

test("formatImpactWhy renders coverage:unknown when coverage is not indexed", () => {
  const why = formatImpactWhy({ ...base, tested: false, coverageKnown: false }, 0.75);
  expect(why).toContain("coverage:unknown");
  expect(why).not.toContain("coverage:untested");
  expect(why).toContain("chain-confidence:0.75");
});

test("formatImpactWhy renders coverage:untested when coverage is indexed but symbol has no tested_by edge", () => {
  const why = formatImpactWhy({ ...base, tested: false, coverageKnown: true });
  expect(why).toContain("coverage:untested");
  expect(why).not.toContain("coverage:unknown");
});

test("formatImpactWhy renders coverage:tested when symbol has a tested_by edge", () => {
  const why = formatImpactWhy({ ...base, tested: true, coverageKnown: false });
  expect(why).toContain("coverage:tested");
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/output-signals-impact-why-coverage-unknown.test.ts`
Expected: FAIL — `expect(received).toContain(expected) ... Expected substring: "coverage:unknown" Received: "[fan-in:0, fan-out:1, roles:leaf, coverage:untested, co-change:0.00, chain-confidence:0.75]"`.

**Step 3 — Write minimal implementation**

In `src/output/signals.ts`, replace `formatImpactWhy`:

```ts
export function formatImpactWhy(signals: NodeSignals, chainConfidence?: number): string {
  const roles = sortRoles(signals.roles, IMPACT_ROLE_ORDER);
  const rolesText = roles.length > 0 ? roles.join(",") : "none";
  const chainPart = typeof chainConfidence === "number"
    ? `, chain-confidence:${chainConfidence.toFixed(2)}`
    : "";
  const coverageText = signals.tested
    ? "tested"
    : signals.coverageKnown
      ? "untested"
      : "unknown";
  return `[fan-in:${signals.fanIn}, fan-out:${signals.fanOut}, roles:${rolesText}, coverage:${coverageText}, co-change:${signals.coChangeScore.toFixed(2)}${chainPart}]`;
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/output-signals-impact-why-coverage-unknown.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**

Run: `bun test && bun run check`
Expected: all passing. Task 4 has already added `store.markCoverageIndexed()` to every existing fixture that asserts `coverage:untested`, so those assertions continue to hold.

### Task 7: End-to-end regression: freshly indexed graph with no coverage emits coverage-unknown [depends: 2, 5, 6]

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
