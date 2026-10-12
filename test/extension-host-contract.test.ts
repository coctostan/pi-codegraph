import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Value } from "typebox/value";
import piCodegraph, {
  extractAnchors,
  getSharedStoreForTesting,
  resetStoreForTesting,
  setIndexProjectForTesting,
} from "../src/index.js";
import { indexProject } from "../src/indexer/pipeline.js";

type Handler = (...args: any[]) => unknown;

function harness() {
  const toolsByName = new Map<string, any>();
  const events = new Map<string, Handler[]>();
  const commands = new Map<string, any>();
  const pi = {
    registerTool: (tool: any) => void toolsByName.set(tool.name, tool),
    registerCommand: (name: string, options: any) => void commands.set(name, options),
    on: (event: string, handler: Handler) => {
      events.set(event, [...(events.get(event) ?? []), handler]);
    },
  };
  piCodegraph(pi as any);
  const emit = async (event: string) => {
    for (const handler of events.get(event) ?? []) await handler({ type: event }, {});
  };
  return { tools: toolsByName, commands, emit };
}

const roots: string[] = [];
function project(source = "export function alpha() {}\nexport function beta() { alpha(); }\n"): string {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-host-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "a.ts"), source);
  return root;
}

afterEach(() => {
  resetStoreForTesting();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("tools declare native host metadata alongside legacy ptc", () => {
  resetStoreForTesting();
  const { tools } = harness();
  expect([...tools.keys()].sort()).toEqual(["impact", "symbol_graph", "trace"]);
  for (const tool of tools.values()) {
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(tool.namespace.name).toBe("codegraph");
    expect(tool.executionMode).toBeUndefined(); // parallel-safe: no override
    expect(tool.promptSnippet.length).toBeGreaterThan(10);
    expect(tool.promptGuidelines.length).toBeGreaterThan(0);
    expect(tool.outputSchema).toBeDefined();
    expect(tool.ptc).toEqual({ callable: true, enabled: true, policy: "read-only", readOnly: true, pythonName: tool.name });
  }
});

test("results carry structuredContent that matches outputSchema", async () => {
  resetStoreForTesting();
  const root = project();
  const { tools } = harness();
  const sg = tools.get("symbol_graph");
  const result = await sg.execute("c1", { name: "alpha" }, undefined, undefined, { cwd: root });
  expect(result.structuredContent.text).toBe(result.content[0].text);
  expect(Value.Check(sg.outputSchema, result.structuredContent)).toBe(true);
  expect(result.structuredContent.anchors).toContainEqual({
    file: "src/a.ts",
    line: 1,
    hash: expect.stringMatching(/^[0-9a-f]{3}$/),
  });
  expect(result.structuredContent.indexingFailed).toBe(false);
});

test("extractAnchors parses file-context anchors and deduplicates", () => {
  const text = [
    "## foo (function)",
    "src/foo.ts  12:abc",
    "  src/bar.ts  3:0f1  bar  calls",
    "  src/bar.ts  3:0f1  bar  calls",
    "12:abc|export function foo() {}",
    "no anchor here",
  ].join("\n");
  expect(extractAnchors(text)).toEqual([
    { file: "src/foo.ts", line: 12, hash: "abc" },
    { file: "src/bar.ts", line: 3, hash: "0f1" },
  ]);
});

test("session_shutdown closes every store and is idempotent", async () => {
  resetStoreForTesting();
  const root = project();
  const { tools, emit } = harness();
  await tools.get("impact").execute("c1", { symbols: ["alpha"], changeType: "behavior_change" }, undefined, undefined, { cwd: root });
  const store = getSharedStoreForTesting()!;
  expect(store).not.toBeNull();
  expect(() => store.getStatistics(root)).not.toThrow();

  await emit("session_shutdown");
  expect(getSharedStoreForTesting()).toBeNull();
  expect(() => store.getStatistics(root)).toThrow();
  await emit("session_shutdown"); // second call must not throw
});

test("a later cwd gets its own store instead of reusing the first project's", async () => {
  resetStoreForTesting();
  const first = project("export function onlyInFirst() {}\n");
  const second = project("export function onlyInSecond() {}\n");
  const { tools } = harness();
  const impactTool = tools.get("impact");
  await impactTool.execute("c1", { symbols: ["onlyInFirst"], changeType: "removal" }, undefined, undefined, { cwd: first });
  const firstStore = getSharedStoreForTesting();
  const out = await impactTool.execute("c2", { symbols: ["onlyInSecond"], changeType: "removal" }, undefined, undefined, { cwd: second });
  expect(getSharedStoreForTesting()).not.toBe(firstStore);
  expect(out.content[0].text).toContain("onlyInSecond");
});

test("an already-aborted signal cancels before indexing starts", async () => {
  resetStoreForTesting();
  const root = project();
  let indexed = 0;
  setIndexProjectForTesting(async (...args) => {
    indexed++;
    return indexProject(...args);
  });
  const { tools } = harness();
  const controller = new AbortController();
  controller.abort(new Error("stop"));
  await expect(
    tools.get("trace").execute("c1", { entry: "alpha" }, controller.signal, undefined, { cwd: root }),
  ).rejects.toThrow("stop");
  expect(indexed).toBe(0);
});

test("aborting during indexing rejects the call without killing the shared index", async () => {
  resetStoreForTesting();
  const root = project();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  setIndexProjectForTesting(async (...args) => {
    await gate;
    return indexProject(...args);
  });
  const { tools } = harness();
  const controller = new AbortController();
  const pending = tools.get("trace").execute("c1", { entry: "alpha" }, controller.signal, undefined, { cwd: root });
  controller.abort(new Error("user cancelled"));
  await expect(pending).rejects.toThrow("user cancelled");

  release();
  const result = await tools.get("trace").execute("c2", { entry: "alpha" }, undefined, undefined, { cwd: root });
  expect(result.content[0].text).toContain("alpha");
});

test("/codegraph reports status without creating a database, and refresh indexes", async () => {
  resetStoreForTesting();
  const root = project();
  const { commands } = harness();
  const notes: Array<[string, string]> = [];
  const ctx = { cwd: root, hasUI: false, ui: { notify: (m: string, l: string) => notes.push([m, l]), setStatus() {} } };
  const cmd = commands.get("codegraph");

  await cmd.handler("", ctx);
  expect(notes.at(-1)![0]).toContain("not indexed yet");
  expect(getSharedStoreForTesting()).toBeNull();

  await cmd.handler("refresh", ctx);
  expect(notes.at(-1)![0]).toMatch(/nodes: \d+/);
  expect(notes.at(-1)![1]).toBe("info");

  await cmd.handler("bogus", ctx);
  expect(notes.at(-1)![1]).toBe("warning");
});

test("indexing status is shown while indexing and cleared afterwards", async () => {
  resetStoreForTesting();
  const root = project();
  const { tools } = harness();
  const statuses: Array<string | undefined> = [];
  const ctx = { cwd: root, hasUI: true, ui: { setStatus: (_k: string, t: string | undefined) => statuses.push(t) } };
  await tools.get("impact").execute("c1", { symbols: ["alpha"], changeType: "removal" }, undefined, undefined, ctx);
  expect(statuses).toEqual(["codegraph: indexing…", undefined]);
});

test("parallel calls are safe: concurrent symbol_graph/impact/trace on one project agree and share one index", async () => {
  resetStoreForTesting();
  const root = project();
  let indexed = 0;
  setIndexProjectForTesting(async (...args) => {
    indexed++;
    return indexProject(...args);
  });
  const { tools } = harness();
  const ctx = { cwd: root };
  const run = (name: string, params: any) => tools.get(name).execute(name, params, undefined, undefined, ctx);

  const results = await Promise.all([
    run("symbol_graph", { name: "alpha" }),
    run("symbol_graph", { name: "alpha" }),
    run("symbol_graph", { name: "alpha", include: ["neighborhood"] }),
    run("impact", { symbols: ["alpha"], changeType: "signature_change" }),
    run("trace", { entry: "beta" }),
  ]);

  expect(indexed).toBe(1);
  expect(results[0].content[0].text).toBe(results[1].content[0].text);
  for (const r of results.slice(0, 4)) expect(r.content[0].text).toContain("alpha");
  expect(results[4].content[0].text).toContain("beta");
});
