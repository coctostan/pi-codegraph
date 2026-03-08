---
id: 4
title: Index coverage artifacts into tested_by edges and stored traces
status: approved
depends_on:
  - 1
  - 2
  - 3
no_test: false
files_to_modify:
  - src/indexer/coverage.ts
  - src/indexer/pipeline.ts
files_to_create:
  - test/indexer-coverage-stage.test.ts
---

### Task 4: Index coverage artifacts into tested_by edges and stored traces [depends: 1, 2, 3]
- Modify: `src/indexer/coverage.ts`
- Modify: `src/indexer/pipeline.ts`
- Create: `test/indexer-coverage-stage.test.ts`
**ACs covered:** 6, 7, 8, 9, 10, 11

**Step 1 — Write the failing tests**
```ts
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("indexProject coverage stage creates coverage tested_by edges and deterministic test trace", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-stage4-edge-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(coverageDir, { recursive: true });

  const appSource = [
    "export function prod() {",
    "  return helper();",
    "}",
    "",
    "export function helper() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");
  const testSource = [
    "export function prodTest() {",
    "  return prod();",
    "}",
    "",
  ].join("\n");

  writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

  const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
  const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");

  writeFileSync(
    join(coverageDir, "report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.test.ts")}`).href,
          functions: [
            {
              functionName: "prodTest",
              ranges: [{ startOffset: testText.indexOf("export function prodTest"), endOffset: testText.length, count: 1 }],
            },
          ],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: [
            {
              functionName: "prod",
              ranges: [{ startOffset: appText.indexOf("export function prod"), endOffset: appText.indexOf("\n\nexport function helper") + 1, count: 1 }],
            },
            {
              functionName: "helper",
              ranges: [{ startOffset: appText.indexOf("export function helper"), endOffset: appText.length, count: 1 }],
            },
          ],
        },
      ],
    }),
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(projectRoot, store, {
      lspClientFactory: () => fakeClient,
      coverageDir,
    });

    const prodNode = store.findNodes("prod", "src/app.ts")[0]!;
    const helperNode = store.findNodes("helper", "src/app.ts")[0]!;
    const testNode = store.findNodes("prodTest", "src/app.test.ts")[0]!;
    const testedBy = store.getNeighbors(prodNode.id, { direction: "out", kind: "tested_by" });

    expect(testedBy).toHaveLength(1);
    expect(testedBy[0]!.node.id).toBe(testNode.id);
    expect(testedBy[0]!.edge.provenance.source).toBe("coverage");
    expect(store.getTestTrace(testNode.id)).toEqual({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testNode.content_hash },
        { nodeId: prodNode.id, ordinal: 1, contentHash: prodNode.content_hash },
        { nodeId: helperNode.id, ordinal: 2, contentHash: helperNode.content_hash },
      ],
    });
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("indexProject coverage stage does not duplicate tested_by edges on rerun", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-stage4-dedupe-${Date.now()}`);
  const coverageDir = join(projectRoot, ".codegraph", "coverage");
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(coverageDir, { recursive: true });

  const appSource = "export function prod() { return 1; }\n";
  const testSource = "export function prodTest() { return prod(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), appSource);
  writeFileSync(join(projectRoot, "src", "app.test.ts"), testSource);

  const appText = readFileSync(join(projectRoot, "src", "app.ts"), "utf8");
  const testText = readFileSync(join(projectRoot, "src", "app.test.ts"), "utf8");

  writeFileSync(
    join(coverageDir, "report.json"),
    JSON.stringify({
      result: [
        {
          url: new URL(`file://${join(projectRoot, "src", "app.test.ts")}`).href,
          functions: [{ functionName: "prodTest", ranges: [{ startOffset: testText.indexOf("export function prodTest"), endOffset: testText.length, count: 1 }] }],
        },
        {
          url: new URL(`file://${join(projectRoot, "src", "app.ts")}`).href,
          functions: [{ functionName: "prod", ranges: [{ startOffset: appText.indexOf("export function prod"), endOffset: appText.length, count: 1 }] }],
        },
      ],
    }),
  );

  const store = new SqliteGraphStore();
  try {
    await indexProject(projectRoot, store, { lspClientFactory: () => fakeClient, coverageDir });
    await indexProject(projectRoot, store, { lspClientFactory: () => fakeClient, coverageDir });

    const prodNode = store.findNodes("prod", "src/app.ts")[0]!;
    const testedByAgain = store.getNeighbors(prodNode.id, { direction: "out", kind: "tested_by" });
    expect(testedByAgain).toHaveLength(1);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/indexer-coverage-stage.test.ts`
Expected: FAIL — `expect(received).toHaveLength(expected)` with `Expected length: 1` and `Received length: 0` because coverage stage wiring and persistence are not implemented yet.

**Step 3 — Write minimal implementation**
`src/indexer/coverage.ts` — extend the Task 1/2 file with a new stage function:
```ts
import type { GraphStore, TestTraceRecord } from "../graph/store.js";

export function runCoverageIndexStage(store: GraphStore, projectRoot: string, coverageDir: string): void {
  const normalized = parseCoverageReports(projectRoot, coverageDir);
  const mapped = mapCoverageToNodes(store, normalized);
  const byReport = new Map<string, MappedCoverageRecord[]>();

  for (const record of mapped) {
    const group = byReport.get(record.reportFile) ?? [];
    group.push(record);
    byReport.set(record.reportFile, group);
  }

  const reportNames = [...byReport.keys()].sort((a, b) => a.localeCompare(b));
  for (const reportFile of reportNames) {
    const group = byReport.get(reportFile)!;
    const tests = group
      .filter((record) => record.node.kind === "test")
      .sort((a, b) => a.node.id.localeCompare(b.node.id));
    const production = group
      .filter((record) => record.node.kind !== "test")
      .sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine || a.node.id.localeCompare(b.node.id));

    for (const testRecord of tests) {
      for (const prodRecord of production) {
        store.addEdge({
          source: prodRecord.node.id,
          target: testRecord.node.id,
          kind: "tested_by",
          provenance: {
            source: "coverage",
            confidence: 1,
            evidence: `${reportFile}:${testRecord.file}:${testRecord.startLine}`,
            content_hash: prodRecord.node.content_hash,
          },
          created_at: testRecord.startLine,
        });
      }

      const trace: TestTraceRecord = {
        testNodeId: testRecord.node.id,
        steps: [
          { nodeId: testRecord.node.id, ordinal: 0, contentHash: testRecord.node.content_hash },
          ...production.map((record, index) => ({
            nodeId: record.node.id,
            ordinal: index + 1,
            contentHash: record.node.content_hash,
          })),
        ],
      };
      store.saveTestTrace(trace);
    }
  }
}
```

`src/indexer/pipeline.ts` — make targeted edits to the current file:
```ts
import { runCoverageIndexStage } from "./coverage.js";
```

```ts
export interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
  coverageDir?: string;
}
```

```ts
await runAstGrepIndexStage(store, projectRoot, changedFiles);
runCoverageIndexStage(store, projectRoot, options.coverageDir ?? join(projectRoot, ".codegraph", "coverage"));
return { indexed, skipped, removed, errors };
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/indexer-coverage-stage.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
