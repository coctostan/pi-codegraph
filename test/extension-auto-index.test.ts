import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extension shares singleton store instance across symbol_graph and resolve_edge", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-singleton-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/alpha.ts"),
    "export function alpha() {}\nexport function beta() { alpha(); }\n",
  );

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    let reExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
        if (tool.name === "resolve_edge") reExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const ctx = { cwd: projectRoot };

    await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
    const first = mod.getSharedStoreForTesting();

    await reExecute!(
      "call-2",
      { source: "beta", target: "alpha", kind: "calls", evidence: "beta calls alpha" },
      undefined,
      undefined,
      ctx,
    );
    const second = mod.getSharedStoreForTesting();

    expect(first).toBeDefined();
    expect(second).toBe(first);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("extension auto-indexes project on first tool call when DB is empty", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-autoindex-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/hello.ts"),
    "export function hello() { return 'world'; }\n",
  );

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await sgExecute!("test-call-id", { name: "hello" }, undefined, undefined, {
      cwd: projectRoot,
    });

    expect(existsSync(join(projectRoot, ".codegraph", "graph.db"))).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("hello");
    expect(text).toContain("function");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
