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
