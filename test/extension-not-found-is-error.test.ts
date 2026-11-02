import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "typebox/value";
import piCodegraph, { getSharedStoreForTesting, resetStoreForTesting } from "../src/index.js";

const roots: string[] = [];

function setup() {
  resetStoreForTesting();
  const root = mkdtempSync(join(tmpdir(), "pi-cg-not-found-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), "export function alpha() {}\nexport function dup() { alpha(); }\n");
  writeFileSync(join(root, "src", "b.ts"), "export function dup() {}\n");
  const tools = new Map<string, any>();
  piCodegraph({ registerTool: (tool: any) => void tools.set(tool.name, tool) } as any);
  const run = (name: string, params: Record<string, unknown>) =>
    tools.get(name).execute("c1", params, undefined, undefined, { cwd: root });
  return Object.assign(run, { schema: (name: string) => tools.get(name).outputSchema });
}

afterEach(() => {
  resetStoreForTesting();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function expectError(result: any, ...fragments: string[]) {
  expect(result.isError).toBe(true);
  expect(result.structuredContent.text).toBe(result.content[0].text);
  for (const fragment of fragments) expect(result.structuredContent.text).toContain(fragment);
}

test("a missing symbol is an error through all three tools", async () => {
  const run = setup();
  expectError(await run("symbol_graph", { name: "missingThing" }), 'Symbol "missingThing" not found');
  expectError(await run("impact", { symbols: ["missingThing"], changeType: "removal" }), 'Symbol "missingThing" not found');
  expectError(await run("trace", { entry: "missingThing" }), 'Symbol "missingThing" not found');
});

test("an ambiguous name through symbol_graph is an error that keeps its match list", async () => {
  const run = setup();
  const result = await run("symbol_graph", { name: "dup" });
  expectError(result, 'Multiple matches for "dup"', "src/a.ts", "src/b.ts");
  expect(result.structuredContent.anchors.map((a: any) => a.file).sort()).toEqual(["src/a.ts", "src/b.ts"]);
  expect(Value.Check(run.schema("symbol_graph"), result.structuredContent)).toBe(true);
});

test("trace scoped to the wrong file is an error that names the other matches", async () => {
  const run = setup();
  expectError(await run("trace", { entry: "alpha", file: "src/b.ts" }), "was not found in src/b.ts", "src/a.ts");
});

test("impact with one found and one missing symbol is an error", async () => {
  const run = setup();
  expectError(await run("impact", { symbols: ["alpha", "missingThing"], changeType: "removal" }), 'Symbol "missingThing" not found');
});

test("an ambiguous name through impact or trace is an error, since neither runs its analysis", async () => {
  const run = setup();
  expectError(await run("impact", { symbols: ["dup"], changeType: "removal" }), 'Multiple matches for "dup"', "src/b.ts");
  expectError(await run("trace", { entry: "dup" }), 'Multiple matches for "dup"', "src/b.ts");
});

test("impact with no symbols is an error", async () => {
  const run = setup();
  expectError(await run("impact", { symbols: [], changeType: "removal" }), "'symbols' parameter is required");
});

test("a found symbol is not an error", async () => {
  const run = setup();
  for (const [name, params] of [
    ["symbol_graph", { name: "alpha" }],
    ["impact", { symbols: ["alpha"], changeType: "removal" }],
    ["trace", { entry: "alpha" }],
  ] as const) {
    expect((await run(name, params)).isError).toBe(false);
  }
});

test("each tool looks a requested name up once per call", async () => {
  const run = setup();
  await run("trace", { entry: "alpha" }); // index first, so indexing's own lookups stay out of the count
  const store = getSharedStoreForTesting()!;
  const findNodes = store.findNodes.bind(store);
  let lookups = 0;
  store.findNodes = (name, file) => {
    if (name === "alpha") lookups++;
    return findNodes(name, file);
  };
  for (const [name, params] of [
    ["symbol_graph", { name: "alpha", include: ["neighborhood", "contract", "source"] }],
    ["impact", { symbols: ["alpha"], changeType: "removal" }],
    ["trace", { entry: "alpha" }],
  ] as const) {
    lookups = 0;
    await run(name, params);
    expect({ name, lookups }).toEqual({ name, lookups: 1 });
  }
});
