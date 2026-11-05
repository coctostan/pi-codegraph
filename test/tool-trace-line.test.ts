import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";

const APP = [
  "const VERSION = 1;",
  "export function helper() { return VERSION; }",
  "export function other() { return 2; }",
  "export function deep() { return 3; }",
  "export function setup(register: (t: object) => void) {",
  "  other();",
  "  register({",
  "    run() {",
  "      helper();",
  "      [1].forEach(() => other());",
  "      function inner() { return deep(); }",
  "      return inner();",
  "    },",
  "    onDone: (n: number) => helper(),",
  "  });",
  "}",
  "export const arrow = () => deep();",
  "export default { start() { helper(); } };",
];
const lineOf = (text: string) => APP.findIndex((l) => l.includes(text)) + 1;

const roots: string[] = [];

function setup() {
  resetStoreForTesting();
  const root = mkdtempSync(join(tmpdir(), "pi-cg-trace-line-"));
  roots.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), `${APP.join("\n")}\n`);
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
    "  other [leaf]",
    "  inner",
    "    deep [leaf]",
  ]);
  expect(out.text).toContain(`src/app.ts  ${lineOf("run() {")}:`);
});

test("a line in an arrow bound to a property traces that arrow alone", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("onDone") });
  expect(tree(out.text)).toEqual(["onDone (in setup)", "  helper [leaf]"]);
});

test("a line in an indexed function traces it as trace by entry does", async () => {
  const { trace } = setup();
  for (const [text, entry] of [["arrow = ", "arrow"], ["other();", "setup"]] as const) {
    const byLine = await trace({ file: "src/app.ts", line: lineOf(text) });
    expect(byLine).toEqual(await trace({ entry, file: "src/app.ts" }));
  }
});

test("a line in a module-level method prints its calls unresolved, since the index files them under no function", async () => {
  const { trace } = setup();
  const out = await trace({ file: "src/app.ts", line: lineOf("start()") });
  expect(out.isError).toBe(false);
  expect(tree(out.text)).toEqual(["start", `  ? helper (unresolved, src/app.ts:${lineOf("start()")})`]);
  expect(out.text.startsWith("Trust: fresh")).toBe(false);
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
