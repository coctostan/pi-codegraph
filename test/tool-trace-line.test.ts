import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import piCodegraph, { resetStoreForTesting, setTsServerClientFactoryForTesting } from "../src/index.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
import { traceResult } from "../src/tools/trace.js";

const APP = [
  "const VERSION = 1;",
  "declare function log(): void;",
  "export function helper() { return VERSION; }",
  "export function other() { return 2; }",
  "export function deep() { return 3; }",
  "export function setup(register: (t: object) => void) {",
  "  other();",
  "  register({",
  "    run() {",
  "      helper();",
  "      log();",
  "      [1].forEach(() => other());",
  "      function inner() { return deep(); }",
  "      return inner();",
  "    },",
  "    quiet() {",
  "      function f() { return deep(); }",
  "      return f;",
  "    },",
  "    flush() { [1].forEach(() => helper()); },",
  "    a() { other(); }, b() { deep(); },",
  "    onDone: (n: number) => helper(),",
  "  });",
  "}",
  "export const arrow = () => deep();",
  "export default { start() { helper(); VERSION.toFixed(); } };",
  "export function tail(items: number[]) {",
  "  other();",
  "  return items.map(() => helper()); }",
  "export const pair = [() => helper(), () => deep()];",
  "export class Store {",
  "  get(id: number) { return this.load(id); }",
  "  load(id: number) {",
  "    other();",
  "    return [id].map(() => this.peek());",
  "  }",
  "  peek() { return deep(); }",
  "}",
  "export function useStore(s: Store, xs: { peek(): void }) {",
  "  return [1].map(() => { xs.peek(); s.peek(); });",
  "}",
  "export class Alpha {",
  "  run() { return deep(); }",
  "}",
  "export class Beta {",
  "  run() { return other(); }",
  "}",
  "export class Gamma {",
  "  constructor() { helper(); }",
  "}",
  "export function both(a: Alpha, b: Beta) {",
  "  return [1].map(() => { b.run(); a.run(); new Gamma(); });",
  "}",
  "export function twice(a: Alpha, b: Beta) {",
  "  a.run();",
  "  b.run();",
  "  return [1].map(() => b.run());",
  "}",
  "export function run() { return 4; }",
  "export function mixed(a: Alpha) {",
  "  a.run();",
  "  run();",
  "  return [1].map(() => a.run());",
  "}",
  "export function loose(s: Store) {",
  "  s.peek();",
  "  return [1].map(() => peek());",
  "}",
];
const lineOf = (text: string) => APP.findIndex((l) => l.includes(text)) + 1;

/**
 * A tsserver stand-in that resolves a call in `src/app.ts` to the `function <name>(` or `class <name> ` declaring it
 * there, a member call to the member `<name>(`, a `b.` receiver's in `Beta`, so no test waits on a real one; an `xs.`
 * receiver is typed by no class.
 */
const sameFileDefinitions: ITsServerClient = {
  definition: async (file, line, col) => {
    const text = APP[line - 1] ?? "";
    const name = /^\w+/.exec(text.slice(col - 1))?.[0];
    const before = text.slice(0, col - 1);
    if (file !== "src/app.ts" || !name || before.endsWith("xs.")) return null;
    const from = before.endsWith("b.") ? APP.indexOf("export class Beta {") : 0;
    const declared = (l: string) =>
      before.endsWith(".") ? l.startsWith(`  ${name}(`) : l.includes(`function ${name}(`) || l.includes(`class ${name} `);
    const at = APP.findIndex((l, i) => i >= from && declared(l));
    return at < 0 ? null : { file, line: at + 1, col: 1 };
  },
  references: async () => [],
  implementations: async () => [],
  shutdown: async () => {},
};

const roots: string[] = [];

function setup() {
  resetStoreForTesting();
  setTsServerClientFactoryForTesting(() => sameFileDefinitions);
  const root = mkdtempSync(join(tmpdir(), "pi-cg-trace-line-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), `${APP.join("\n")}\n`);
  writeFileSync(
    join(root, "src", "app.test.ts"),
    'import { test } from "bun:test";\nimport { helper } from "./app";\ntest("calls helper", () => {\n  helper();\n});\n',
  );
  const tools = new Map<string, any>();
  piCodegraph({ registerTool: (tool: any) => void tools.set(tool.name, tool) } as any);
  return {
    schema: tools.get("trace").parameters,
    trace: async (params: Record<string, unknown>) => {
      const out = await tools.get("trace").execute("c1", params, undefined, undefined, { cwd: root });
      return { text: out.content[0].text as string, isError: out.isError === true };
    },
  };
}

afterEach(() => {
  resetStoreForTesting();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The tree's lines below the mode header, anchors and hashes dropped. */
const tree = (text: string) =>
  text
    .slice(text.indexOf("mode: "))
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((l) => l.replace(/src\/app\.ts {2}\d+:[0-9a-f]{3} {2}/, ""));

test("trace's schema takes an optional line and leaves entry optional", () => {
  const { schema } = setup();
  expect(schema.properties.line.type).toBe("number");
  expect(schema.required ?? []).not.toContain("entry");
  expect(schema.required ?? []).not.toContain("line");
});

test("a line in an object method traces that method's calls, a nested callback's included, in call order", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("helper();") });
  expect(out.isError).toBe(false);
  expect(tree(out.text)).toEqual([
    "run (in setup)",
    "  helper [leaf]",
    `  ? log (unresolved, src/app.ts:${lineOf("log();")})`,
    "  other [leaf]",
    "  inner",
    "    deep [leaf]",
  ]);
  expect(out.text).toContain(`src/app.ts  ${lineOf("run() {")}:`);
  // `log` reads unresolved as the index stored it under `setup`, so the result stays fresh.
  expect(out.text.startsWith("Trust: fresh")).toBe(true);
});

test("a line in an arrow bound to a property traces that arrow alone", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("onDone") });
  expect(tree(out.text)).toEqual(["onDone (in setup)", "  helper [leaf]"]);
});

test("an entry trace whose root defines named callbacks ends naming each by file and line; an anonymous one goes unnamed", async () => {
  const { trace } = setup();
  const out = await trace({ entry: "setup", file: "src/app.ts" });
  expect(out.text.trimEnd().split("\n").at(-1)).toBe(
    `  → callbacks inside: run (src/app.ts:${lineOf("run() {")}), onDone (src/app.ts:${lineOf("onDone")}); trace one alone by \`file\` + \`line\``,
  );
  expect((await trace({ entry: "tail", file: "src/app.ts" })).text).not.toContain("→");
  // Each named location traces that callback alone; a callback sharing its first line with another function goes unnamed.
  for (const [, name, line] of out.text.matchAll(/(\w+) \(src\/app\.ts:(\d+)\)/g)) {
    expect(tree((await trace({ file: "src/app.ts", line: Number(line) })).text)[0]).toBe(`${name} (in setup)`);
  }
});

test("a callback ending on its enclosing function's last line traces the callback, not that function", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("items.map") });
  expect(tree(out.text)).toEqual(["<anonymous> (in tail)", "  helper [leaf]"]);
});

test("a line holding two functions side by side is an error naming both", async () => {
  const { trace } = setup();
  const line = lineOf("pair = ");
  const out = await trace({ file: "src/app.ts", line });
  expect(out.isError).toBe(true);
  expect(out.text).toContain(`Several functions hold line ${line} of src/app.ts`);
  expect(out.text).toContain(`<anonymous> (src/app.ts:${line}:22)`);
  expect(out.text).toContain(`<anonymous> (src/app.ts:${line}:38)`);
});

test("a class member traces by Class.member, its this-calls to its class's members resolved beneath it", async () => {
  const { trace } = setup();
  const out = await trace({ entry: "Store.get", file: "src/app.ts" });
  expect(out.isError).toBe(false);
  expect(tree(out.text)).toEqual(["Store.get", "  Store.load", "    other [leaf]", "    Store.peek", "      deep [leaf]"]);
  expect(out.text.startsWith("Trust: fresh")).toBe(true);
});

test("a line in a class member traces that member as its entry does; a line in a callback inside it names the member", async () => {
  const { trace } = setup();
  expect(await trace({ file: "src/app.ts", line: lineOf("load(id: number) {") })).toEqual(
    await trace({ entry: "Store.load", file: "src/app.ts" }),
  );
  const callback = await trace({ file: "src/app.ts", line: lineOf("this.peek()") });
  expect(tree(callback.text)).toEqual(["<anonymous> (in Store.load)", "  Store.peek", "    deep [leaf]"]);
  expect(callback.text.startsWith("Trust: fresh")).toBe(true);
});

test("another object's member call tsserver resolves traces to that member, by entry and by line; one it can't prints nothing", async () => {
  const { trace } = setup();
  const byEntry = await trace({ entry: "useStore", file: "src/app.ts" });
  expect(tree(byEntry.text)).toEqual(["useStore [entry-point]", "  Store.peek", "    deep [leaf]"]);
  const byLine = await trace({ file: "src/app.ts", line: lineOf("xs.peek()") });
  expect(tree(byLine.text)).toEqual(["<anonymous> (in useStore)", "  Store.peek", "    deep [leaf]"]);
  expect(byLine.text.startsWith("Trust: fresh")).toBe(true);
});

test("a callback's member calls on two namesakes trace each to its own class, its new X() to X's constructor", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("b.run()") });
  expect(tree(out.text)).toEqual([
    "<anonymous> (in both)",
    "  Beta.run",
    "    other [leaf]",
    "  Alpha.run",
    "    deep [leaf]",
    "  Gamma.constructor",
    "    helper [leaf]",
  ]);
  expect(out.text.startsWith("Trust: fresh")).toBe(true);
});

test("a callback's member call its owner makes to two namesakes before it reads unresolved, not a guess", async () => {
  const { trace } = setup();
  const line = lineOf("map(() => b.run())");
  const out = await trace({ file: "src/app.ts", line });
  expect(tree(out.text)).toEqual(["<anonymous> (in twice)", `  ? run (unresolved, src/app.ts:${line})`]);
  expect(out.text.startsWith("Trust: fresh")).toBe(false);
});

test("a callback's member call reaches its owner's member, not a free function of its name", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("map(() => a.run())") });
  expect(tree(out.text)).toEqual(["<anonymous> (in mixed)", "  Alpha.run", "    deep [leaf]"]);
  expect(out.text.startsWith("Trust: fresh")).toBe(true);
});

test("a callback's call by a name its owner holds unresolved reads unresolved, not as the owner's member of that name", async () => {
  const { trace } = setup();
  const line = lineOf("map(() => peek())");
  const out = await trace({ file: "src/app.ts", line });
  expect(tree(out.text)).toEqual(["<anonymous> (in loose)", `  ? peek (unresolved, src/app.ts:${line})`]);
});

test("a line in an indexed function traces it as trace by entry does", async () => {
  const { trace } = setup();
  for (const [file, line, entry] of [
    ["src/app.ts", lineOf("arrow = "), "arrow"],
    ["src/app.ts", lineOf("other();"), "setup"],
    ["src/app.test.ts", 4, "src/app.test.ts > calls helper"],
  ] as const) {
    const byLine = await trace({ file, line });
    expect(byLine.text).toContain(entry.split(" > ").at(-1)!);
    expect(byLine).toEqual(await trace({ entry, file }));
  }
});

test("a line in a module-level method prints its calls unresolved, since the index files them under no function, and no obj.m() call", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("start()") });
  expect(out.isError).toBe(false);
  expect(tree(out.text)).toEqual(["start", `  ? helper (unresolved, src/app.ts:${lineOf("start()")})`]);
  expect(out.text.startsWith("Trust: fresh")).toBe(false);
});

test("a module-level method's trace reads stale when its file changed since indexing, though it makes no calls", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-trace-line-stale-"));
  roots.push(projectRoot);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "mod.ts"), "export default { start() {} };\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/mod.ts::src/mod.ts:1", kind: "module", name: "src/mod.ts", file: "src/mod.ts", start_line: 1, end_line: 2, content_hash: "old" });
    const { text, resolved } = traceResult({ file: "src/mod.ts", line: 1, store, projectRoot });
    expect(resolved).toBe(true);
    expect(text.startsWith("Trust: stale")).toBe(true);
  } finally {
    store.close();
  }
});

test("a line in no function, a line without file, and no entry or line are errors", async () => {
  const { trace } = setup();
  const noFunction = await trace({ file: "src/app.ts", line: 1 });
  expect(noFunction.isError).toBe(true);
  expect(noFunction.text).toContain("No function holds line 1 of src/app.ts");
  const noFile = await trace({ line: 3 });
  expect(noFile.isError).toBe(true);
  expect(noFile.text).toContain("`line` needs `file`");
  const neither = await trace({});
  expect(neither.isError).toBe(true);
  expect(neither.text).toContain("`entry`, or `file` with `line`");
  const missing = await trace({ file: "src/nope.ts", line: 3 });
  expect(missing.isError).toBe(true);
  expect(missing.text).toContain("src/nope.ts could not be read");
});
