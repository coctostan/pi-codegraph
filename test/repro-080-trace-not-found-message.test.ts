import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";
import { trace } from "../src/tools/trace.js";

function setupWalkFixture() {
  const projectRoot = join(tmpdir(), `pi-cg-repro-080-${Date.now()}`);
  const file = "src/walk.ts";
  const content = "export function walk() {}\n";

  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, file), content);

  const extracted = extractFile(file, content);
  const store = new SqliteGraphStore();
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);

  return {
    file,
    projectRoot,
    store,
    cleanup() {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("trace labels a missing entry as a symbol lookup failure", () => {
  const fixture = setupWalkFixture();
  try {
    const output = trace({ entry: "runPipeline", store: fixture.store, projectRoot: fixture.projectRoot });

    expect(output).toContain('Symbol "runPipeline" not found');
  } finally {
    fixture.cleanup();
  }
});

test("trace suggests the real symbol location when the file filter misses", () => {
  const fixture = setupWalkFixture();
  try {
    const directOutput = trace({ entry: "walk", file: fixture.file, store: fixture.store, projectRoot: fixture.projectRoot });
    const wrongFileOutput = trace({
      entry: "walk",
      file: "src/does-not-exist.ts",
      store: fixture.store,
      projectRoot: fixture.projectRoot,
    });

    expect(directOutput).toContain("walk");
    expect(wrongFileOutput).toContain("src/walk.ts");
    expect(wrongFileOutput).not.toContain('Entry "walk" not found');
  } finally {
    fixture.cleanup();
  }
});
