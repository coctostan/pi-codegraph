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
