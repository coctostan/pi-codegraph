import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createTestProject(): string {
  const root = join(tmpdir(), `pi-cg-mutex-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return root;
}

describe("RC-E: ensureIndexed coalesces parallel calls", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  test("N=4 parallel tool invocations run indexProject exactly once, and resetStoreForTesting restores the override + in-flight state", async () => {
    const root = createTestProject();
    dirs.push(root);

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    // Install a counting/stalling indexProject override before registering tools.
    let indexCallCount = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    mod.setIndexProjectForTesting(async () => {
      indexCallCount++;
      await gate;
      return { indexed: 0, skipped: 0, removed: 0, errors: 0, timings: {} };
    });

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    const prevDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (prevDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = prevDev;
    }

    try {
      const ctx = { cwd: root };
      const p1 = sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      const p2 = sgExecute!("c2", { name: "alpha" }, undefined, undefined, ctx);
      const p3 = sgExecute!("c3", { name: "alpha" }, undefined, undefined, ctx);
      const p4 = sgExecute!("c4", { name: "alpha" }, undefined, undefined, ctx);
      // entered ensureIndexed and awaited the in-flight promise.
      await new Promise((r) => setTimeout(r, 20));
      release();
      const results = await Promise.all([p1, p2, p3, p4]);
      expect(results.length).toBe(4);
      for (const r of results) expect(r.content[0]?.text).toBeDefined();
      expect(indexCallCount).toBe(1);
      // resetStoreForTesting must clear BOTH new pieces of module-level
      // state introduced by this batch: `indexProjectImpl` (so later calls
      // do not keep hitting the stale override) and `indexingInFlight` (so
      // they do not await a resolved-but-not-cleared promise).
      mod.resetStoreForTesting();

      let secondCallCount = 0;
      mod.setIndexProjectForTesting(async () => {
        secondCallCount++;
        return { indexed: 0, skipped: 0, removed: 0, errors: 0, timings: {} };
      });

      await sgExecute!("after-reset", { name: "alpha" }, undefined, undefined, ctx);

      // The first override was cleared by resetStoreForTesting — if the
      // reset had forgotten to restore `indexProjectImpl`, indexCallCount
      // would have ticked up to 2 here instead.
      expect(indexCallCount).toBe(1);
      // The fresh override installed after the reset did run once, which
      // also proves `indexingInFlight` was cleared (otherwise the post-reset
      // call would have awaited a nulled-out promise or no-op'd).
      expect(secondCallCount).toBe(1);
    } finally {
      mod.setIndexProjectForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
