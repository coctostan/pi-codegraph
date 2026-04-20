// Failing test for batch issue 072-harden-ensureindexed-error-path-real-mes.
// Demonstrates that when ensureIndexed catches a NON-readonly error (e.g. a
// pipeline stage throwing from store.listFiles), `indexingFailedNote()`
// still returns the hardcoded "readonly database" string instead of the real
// error message.
//
// Expected after fix: the tool output contains
//   "indexing-failed: tsserver crashed"
// (or similar) — never "readonly database" for a writable DB.
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
  test("non-readonly indexing failure is reported verbatim in tool output", async () => {
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
    const previousDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (previousDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = previousDev;
    }

    // Force a non-readonly error inside the indexing pipeline. `listFiles()`
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
      // "readonly database" regardless of the real cause. These assertions
      // force two things:
      //  1) the rendered text must contain the real captured message
      //     ("tsserver crashed"), proving RC-C is fixed at this call site;
      //  2) the rendered text must never manufacture "readonly database"
      //     from a non-readonly failure.
      //
      // We use a first-call assertion on purpose: Task 7's clear-on-healthy
      // reset is reverted to post-prefix (the clear affects the NEXT call),
      // so the note is still present on this first call where we can assert
      // its contents directly.
      expect(sgText).toContain("tsserver crashed");
      expect(sgText).not.toContain("readonly database");
      expect(sgText).toContain("alpha");
    } finally {
      SqliteGraphStore.prototype.listFiles = originalListFiles;
      mod.resetStoreForTesting();
    }
  });
});