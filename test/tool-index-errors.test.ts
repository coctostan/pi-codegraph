import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import piCodegraph, { resetStoreForTesting, setTsServerClientFactoryForTesting } from "../src/index.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

type Tool = { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }>; isError: boolean }> };

// a calls b, so tsserver resolves that call; the c files stand alone.
const client: ITsServerClient = {
  definition: async () => ({ file: "src/b.ts", line: 1, col: 17 }),
  references: async () => [],
  implementations: async () => [],
  shutdown: async () => {},
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** The extension on a fixture whose `unreadable` files under `src/` are `chmod 000`. */
function fixture(unreadable: string[]) {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-index-errors-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), 'import { b } from "./b";\nexport function a() {\n  b();\n}\n');
  writeFileSync(join(root, "src", "b.ts"), "export function b() {}\n");
  for (const file of unreadable) {
    const path = join(root, "src", file);
    writeFileSync(path, `export function ${file.replace(/\.ts$/, "")}() {}\n`);
    chmodSync(path, 0o000);
  }
  resetStoreForTesting();
  setTsServerClientFactoryForTesting(() => client);
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };

  const tools = new Map<string, Tool>();
  let command: { handler: Function } | undefined;
  piCodegraph({
    registerTool: (t: Tool & { name: string }) => tools.set(t.name, t),
    registerCommand: (_name: string, spec: { handler: Function }) => (command = spec),
    on() {},
  } as never);
  return {
    readable: (file: string) => chmodSync(join(root, "src", file), 0o644),
    call: async (tool: string, params: unknown) => {
      const result = await tools.get(tool)!.execute("c", params, undefined, undefined, { cwd: root });
      return { text: result.content[0]!.text, isError: result.isError };
    },
    status: async () => {
      let text = "";
      await command!.handler("status", { cwd: root, hasUI: false, ui: { notify: (t: string) => (text = t) } });
      return text;
    },
  };
}

test("every result reads partial and names an unreadable file until a clean run", async () => {
  const { call, status, readable } = fixture(["c.ts"]);
  const line = "\n- index errors: src/c.ts\n";

  for (const [tool, params] of [
    ["symbol_graph", { name: "b" }],
    ["trace", { entry: "a" }],
    ["impact", { symbols: ["b"], changeType: "behavior_change" }],
  ] as const) {
    const { text, isError } = await call(tool, params);
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toContain(line);
    expect(isError).toBe(false);
  }
  const missing = await call("symbol_graph", { name: "c" });
  expect(missing.isError).toBe(true);
  expect(missing.text).toStartWith("Trust: partial\n");
  expect(missing.text).toContain(line);
  expect(await status()).toContain("index errors: src/c.ts (read)");

  readable("c.ts");
  const found = await call("symbol_graph", { name: "c" });
  expect(found.isError).toBe(false);
  expect(found.text).toStartWith("Trust: fresh");
  expect(found.text).not.toContain("index errors");
  expect(await status()).not.toContain("index errors");
});

test("the line names 5 lost files, then counts the rest", async () => {
  const files = ["c1.ts", "c2.ts", "c3.ts", "c4.ts", "c5.ts", "c6.ts", "c7.ts"];
  const { call } = fixture(files);
  const { text } = await call("symbol_graph", { name: "b" });
  expect(text).toStartWith("Trust: partial\n");
  expect(text).toContain("\n- index errors: src/c1.ts, src/c2.ts, src/c3.ts, src/c4.ts, src/c5.ts, +2 more\n");
});
