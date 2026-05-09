import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace returns stored coverage traces for tests and deterministically selects one covering test for a production symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-coverage-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function prod() { return helper(); }\nexport function helper() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "app.test.ts"), "export function alphaTest() { return prod(); }\nexport function betaTest() { return prod(); }\n");

  const store = new SqliteGraphStore();
  try {
    const alpha = { id: "src/app.test.ts::alphaTest:1", kind: "test" as const, name: "alphaTest", file: "src/app.test.ts", start_line: 1, end_line: 1, content_hash: "h-test" };
    const beta = { id: "src/app.test.ts::betaTest:2", kind: "test" as const, name: "betaTest", file: "src/app.test.ts", start_line: 2, end_line: 2, content_hash: "h-test" };
    const prod = { id: "src/app.ts::prod:1", kind: "function" as const, name: "prod", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const helper = { id: "src/app.ts::helper:2", kind: "function" as const, name: "helper", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };

    store.addNode(alpha);
    store.addNode(beta);
    store.addNode(prod);
    store.addNode(helper);
    store.addEdge({ source: prod.id, target: alpha.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "alpha", content_hash: prod.content_hash }, created_at: 1 });
    store.addEdge({ source: prod.id, target: beta.id, kind: "tested_by", provenance: { source: "coverage", confidence: 1, evidence: "beta", content_hash: prod.content_hash }, created_at: 2 });

    store.saveTestTrace({
      testNodeId: alpha.id,
      steps: [
        { nodeId: alpha.id, ordinal: 0, contentHash: alpha.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
        { nodeId: helper.id, ordinal: 2, contentHash: helper.content_hash },
      ],
    });

    store.saveTestTrace({
      testNodeId: beta.id,
      steps: [
        { nodeId: beta.id, ordinal: 0, contentHash: beta.content_hash },
        { nodeId: prod.id, ordinal: 1, contentHash: prod.content_hash },
      ],
    });

    const direct = trace({ entry: "alphaTest", file: "src/app.test.ts", store, projectRoot });
    const byProd = trace({ entry: "prod", file: "src/app.ts", store, projectRoot });

    expect(direct).toContain("mode: coverage");
    expect(direct).toMatch(/src\/app\.test\.ts  1:[0-9a-f]{3}/);
    expect(direct).toMatch(/src\/app\.ts  1:[0-9a-f]{3}/);
    expect(direct).toMatch(/src\/app\.ts  2:[0-9a-f]{3}/);
    expect(direct).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
    expect(byProd).toContain("alphaTest");
    expect(byProd).not.toContain("betaTest");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
