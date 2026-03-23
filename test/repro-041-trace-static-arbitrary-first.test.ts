import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace static mode includes all callees, not just the alphabetically-first one", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-branches-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "pipeline.ts"),
    [
      "export function indexProject() { walkFiles(); runLsp(); runCoverage(); }",
      "export function walkFiles() {}",
      "export function runLsp() {}",
      "export function runCoverage() {}",
    ].join("\n") + "\n",
  );

  const store = new SqliteGraphStore();
  try {
    const indexProject = {
      id: "src/pipeline.ts::indexProject:1", kind: "function" as const, name: "indexProject",
      file: "src/pipeline.ts", start_line: 1, end_line: 1, content_hash: "h1",
    };
    const walkFiles = {
      id: "src/pipeline.ts::walkFiles:2", kind: "function" as const, name: "walkFiles",
      file: "src/pipeline.ts", start_line: 2, end_line: 2, content_hash: "h1",
    };
    const runLsp = {
      id: "src/pipeline.ts::runLsp:3", kind: "function" as const, name: "runLsp",
      file: "src/pipeline.ts", start_line: 3, end_line: 3, content_hash: "h1",
    };
    const runCoverage = {
      id: "src/pipeline.ts::runCoverage:4", kind: "function" as const, name: "runCoverage",
      file: "src/pipeline.ts", start_line: 4, end_line: 4, content_hash: "h1",
    };

    store.addNode(indexProject);
    store.addNode(walkFiles);
    store.addNode(runLsp);
    store.addNode(runCoverage);

    store.addEdge({
      source: indexProject.id, target: walkFiles.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "walkFiles()", content_hash: "h1" },
      created_at: 1,
    });
    store.addEdge({
      source: indexProject.id, target: runLsp.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "runLsp()", content_hash: "h1" },
      created_at: 2,
    });
    store.addEdge({
      source: indexProject.id, target: runCoverage.id, kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "runCoverage()", content_hash: "h1" },
      created_at: 3,
    });

    const output = trace({ entry: "indexProject", file: "src/pipeline.ts", store, projectRoot });

    // The trace SHOULD include all 3 callees
    expect(output).toContain("indexProject");
    expect(output).toContain("walkFiles");
    expect(output).toContain("runLsp");
    expect(output).toContain("runCoverage");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
