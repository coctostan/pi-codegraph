import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

const roots: string[] = [];

function setup(files: Record<string, string>) {
  resetStoreForTesting();
  const root = mkdtempSync(join(tmpdir(), "pi-cg-bare-member-"));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  const tools = new Map<string, any>();
  piCodegraph({ registerTool: (tool: any) => void tools.set(tool.name, tool) } as any);
  return async (name: string, params: Record<string, unknown>) => {
    const result = await tools.get(name).execute("c1", params, undefined, undefined, { cwd: root });
    return { isError: result.isError as boolean, text: result.content[0].text as string };
  };
}

afterEach(() => {
  resetStoreForTesting();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const store = [
  "export class Store {",
  "  add(x: number) { return this.check(x); }",
  "  check(x: number) { return x > 0; }",
  "}",
  "export function useStore(s: Store) { return s.add(1); }",
  "",
].join("\n");

test("a bare method name resolves to its Class.member node through all three tools", async () => {
  const run = setup({ "src/store.ts": store });

  const graph = await run("symbol_graph", { name: "add" });
  expect(graph.isError).toBe(false);
  expect(graph.text).toContain("## Store.add (function)");

  const trace = await run("trace", { entry: "add" });
  expect(trace.isError).toBe(false);
  expect(trace.text).toContain("Store.add");
  expect(trace.text).toContain("Store.check");

  const impact = await run("impact", { symbols: ["check"], changeType: "behavior_change" });
  expect(impact.isError).toBe(false);
  expect(impact.text).toContain("Store.add");
});

test("a bare name two classes declare is an error listing both members", async () => {
  const run = setup({
    "src/store.ts": store,
    "src/cache.ts": "export class Cache {\n  add(k: string) { return k; }\n}\n",
  });
  for (const [name, params] of [
    ["symbol_graph", { name: "add" }],
    ["trace", { entry: "add" }],
    ["impact", { symbols: ["add"], changeType: "removal" }],
  ] as const) {
    const result = await run(name, params);
    expect({ name, isError: result.isError }).toEqual({ name, isError: true });
    expect(result.text).toContain('Multiple matches for "add"');
    expect(result.text).toContain("Store.add (function)");
    expect(result.text).toContain("Cache.add (function)");
  }
});

test("file scopes a bare member lookup", async () => {
  const run = setup({
    "src/store.ts": store,
    "src/cache.ts": "export class Cache {\n  add(k: string) { return k; }\n}\n",
  });
  const result = await run("symbol_graph", { name: "add", file: "src/cache.ts" });
  expect(result.isError).toBe(false);
  expect(result.text).toContain("## Cache.add (function)");

  const miss = await run("trace", { entry: "check", file: "src/cache.ts" });
  expect(miss.isError).toBe(true);
  expect(miss.text).toContain("was not found in src/cache.ts");
  expect(miss.text).toContain("src/store.ts");
});

test("an exact name wins over a member of the same bare name", async () => {
  const run = setup({
    "src/store.ts": store,
    "src/add.ts": "export function add(a: number, b: number) { return a + b; }\n",
  });
  const result = await run("symbol_graph", { name: "add" });
  expect(result.isError).toBe(false);
  expect(result.text).toContain("## add (function)");
  expect(result.text).not.toContain("Store.add");
});

test("only a dotless name falls back, and only to class members", async () => {
  const run = setup({ "src/store.ts": store });
  expect((await run("symbol_graph", { name: "Other.add" })).isError).toBe(true);
  // `src/store.ts` is a module node whose name ends in `.ts`; a bare `ts` is no member.
  expect((await run("symbol_graph", { name: "ts" })).text).toContain('Symbol "ts" not found');
});
