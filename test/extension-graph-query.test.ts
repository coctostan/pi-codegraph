import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("pi extension registers graph_query with query schema and auto-indexes on first call when CODEGRAPH_DEVMODE=1", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-gq-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function hello() { return 'world'; }\n");

  const previous = process.env.CODEGRAPH_DEVMODE;
  process.env.CODEGRAPH_DEVMODE = "1";

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    const registeredTools: Array<{ name: string; parameters: any; execute: Function }> = [];
    const mockPi = {
      registerTool(tool: { name: string; parameters: any; execute: Function }) {
        registeredTools.push(tool);
      },
      on() {},
    };

    mod.default(mockPi as any);

    const tool = registeredTools.find((candidate) => candidate.name === "graph_query");
    expect(tool).toBeDefined();
    expect(tool!.parameters.properties.query).toBeDefined();
    expect(tool!.parameters.required).toContain("query");

    const result = await tool!.execute(
      "call-1",
      { query: 'MATCH (a {name: "hello"}) RETURN a' },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    expect(result.content[0]?.text ?? "").toContain("hello");
  } finally {
    if (previous === undefined) delete process.env.CODEGRAPH_DEVMODE;
    else process.env.CODEGRAPH_DEVMODE = previous;
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
