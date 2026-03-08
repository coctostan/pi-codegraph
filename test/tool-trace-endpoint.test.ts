import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace resolves endpoint entries through routes_to edges to the same deterministic coverage-backed trace policy", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-endpoint-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export function handler() { return service(); }\nexport function service() { return 1; }\napp.get('/users', handler);\n");
  writeFileSync(join(projectRoot, "src", "api.test.ts"), "export function usersTest() { return handler(); }\n");

  const store = new SqliteGraphStore();
  try {
    const endpoint = { id: "endpoint:GET:/users", kind: "endpoint" as const, name: "endpoint:GET:/users", file: "src/api.ts", start_line: 3, end_line: 3, content_hash: "h-api" };
    const handler = { id: "src/api.ts::handler:1", kind: "function" as const, name: "handler", file: "src/api.ts", start_line: 1, end_line: 1, content_hash: "h-api" };
    const service = { id: "src/api.ts::service:2", kind: "function" as const, name: "service", file: "src/api.ts", start_line: 2, end_line: 2, content_hash: "h-api" };
    const testNode = { id: "src/api.test.ts::usersTest:1", kind: "test" as const, name: "usersTest", file: "src/api.test.ts", start_line: 1, end_line: 1, content_hash: "h-test" };

    store.addNode(endpoint);
    store.addNode(handler);
    store.addNode(service);
    store.addNode(testNode);
    store.addEdge({
      source: handler.id,
      target: endpoint.id,
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.9, evidence: "app.get('/users', handler)", content_hash: "h-api" },
      created_at: 1,
    });
    store.addEdge({
      source: handler.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 1, evidence: "users", content_hash: handler.content_hash },
      created_at: 2,
    });
    store.saveTestTrace({
      testNodeId: testNode.id,
      steps: [
        { nodeId: testNode.id, ordinal: 0, contentHash: testNode.content_hash },
        { nodeId: handler.id, ordinal: 1, contentHash: handler.content_hash },
        { nodeId: service.id, ordinal: 2, contentHash: service.content_hash },
      ],
    });

    const output = trace({ entry: "endpoint:GET:/users", store, projectRoot });
    expect(output).toContain("mode: coverage");
    expect(output).toContain("usersTest");
    expect(output).toContain("handler");
    expect(output).toContain("service");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
