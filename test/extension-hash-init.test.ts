import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("extension tool execution initializes hashing before rendering anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-extension-hash-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const runnerRoot = join(tmpdir(), `pi-cg-extension-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(runnerRoot, { recursive: true });
  writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() {}\n");

  const emptyBunfig = join(runnerRoot, "bunfig.toml");
  const runner = join(runnerRoot, "runner.ts");
  writeFileSync(emptyBunfig, "[test]\n");
  writeFileSync(
    runner,
    `
import piCodegraph, { resetStoreForTesting } from ${JSON.stringify(pathToFileURL(join(process.cwd(), "src/index.ts")).href)};
import { expect } from "bun:test";

const tools: any[] = [];
const mockPi = {
  registerTool(tool: any) {
    tools.push(tool);
  },
};

resetStoreForTesting();
piCodegraph(mockPi as any);
const tool = tools.find((candidate) => candidate.name === "symbol_graph");
if (!tool) throw new Error("symbol_graph was not registered");

try {
  const result = await tool.execute(
    "hash-init",
    { name: "foo", file: "src/foo.ts", suppressTrustHeader: true },
    undefined,
    () => {},
    { cwd: ${JSON.stringify(projectRoot)} },
  );
  const text = result.content[0].text as string;
  expect(text).toContain("## foo (function)");
  expect(text).toMatch(/\\b1:0?c27\\b/);
  expect(text).not.toContain("Hash not initialized");
  console.log("runner-ok");
} finally {
  resetStoreForTesting();
}
`,
  );

  try {
    const result = spawnSync("bun", [runner], {
      cwd: runnerRoot,
      encoding: "utf-8",
    });

    expect(result.stderr).not.toContain("Hash not initialized");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("runner-ok");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(runnerRoot, { recursive: true, force: true });
  }
});
