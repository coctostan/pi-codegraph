import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension refreshes a persisted stale graph before symbol_graph responds", async () => {
  const fixtureRoot = join(tmpdir(), `pi-cg-stale-refresh-${Date.now()}`);
  mkdirSync(fixtureRoot, { recursive: true });
  cpSync(join(process.cwd(), "src"), join(fixtureRoot, "src"), { recursive: true });
  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    let symbolGraphExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") symbolGraphExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const ctx = { cwd: fixtureRoot };
    await symbolGraphExecute!("initial-sg", { name: "GraphStore", file: "src/graph/store.ts" }, undefined, undefined, ctx);
    const storePath = join(fixtureRoot, "src/graph/store.ts");
    writeFileSync(storePath, `// shift 1\n// shift 2\n// shift 3\n${readFileSync(storePath, "utf8")}`);
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();
    mod.default(mockPi as any);
    const symbolGraphResult = await symbolGraphExecute!(
      "stale-sg",
      { name: "GraphStore", file: "src/graph/store.ts" },
      undefined,
      undefined,
      ctx,
    );
    const symbolGraphText = symbolGraphResult.content[0]?.text ?? "";
    expect(symbolGraphText).toContain("src/graph/store.ts:33:");
    expect(symbolGraphText).not.toContain("[stale]");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}, 30_000);
