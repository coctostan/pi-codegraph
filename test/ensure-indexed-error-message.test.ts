// Batch issue 072-harden-ensureindexed-error-path-real-mes: when ensureIndexed catches an error (e.g. a pipeline
// stage throwing from store.listFiles), `indexingFailedNote()` carries the real error message.
import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
function createTestProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-err-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return projectRoot;
}
describe("batch 072: indexingFailedNote surfaces the real error message", () => {
  const testDirs: string[] = [];
  afterEach(() => {
    for (const dir of testDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    testDirs.length = 0;
  });
  test("an indexing failure is reported verbatim in tool output", async () => {
    const projectRoot = createTestProject();
    testDirs.push(projectRoot);

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    mod.default(mockPi as any);

    // Force an error inside the indexing pipeline. `listFiles()`
    // is called from `src/indexer/pipeline.ts:96` and `src/indexer/lsp.ts:46`
    // outside any per-item try/catch, so the throw propagates up through
    // `indexProject` into `ensureIndexed`'s catch block, setting
    // `lastIndexError` to our synthetic crash. This path stays unguarded
    // across Tasks 2–5.
    const originalListFiles = SqliteGraphStore.prototype.listFiles;
    SqliteGraphStore.prototype.listFiles = function () {
      throw new Error("tsserver crashed");
    };

    try {
      const ctx = { cwd: projectRoot };
      const sgResult = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
      const sgText: string = sgResult.content[0]?.text ?? "";
      // A first-call assertion on purpose: the clear-on-healthy reset runs after
      // the note is built, so the note is still present on this first call.
      expect(sgText).toContain("tsserver crashed");
      expect(sgText).toContain("alpha");
    } finally {
      SqliteGraphStore.prototype.listFiles = originalListFiles;
      mod.resetStoreForTesting();
    }
  });
});