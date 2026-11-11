import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import piCodegraph, { resetStoreForTesting } from "../src/index.js";

// Pins, as the tools print them before a call edge is stored per call site, one line per target for a caller that
// calls one target from several sites: `repeat` calls `run` at lines 4, 6, 7 and 9, the test case twice.

type Tool = { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }> };

const MAIN = [
  'import { run } from "./a";',
  "",
  "export function repeat(): void {",
  "  run();",
  "  [1].forEach(() => {",
  "    run();",
  "    run();",
  "  });",
  "  run();",
  "}",
  "",
].join("\n");

const TEST = [
  'import { test } from "bun:test";',
  'import { run } from "./a";',
  "",
  'test("runs twice", () => {',
  "  run();",
  "  run();",
  "});",
  "",
].join("\n");

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** The extension, on its real tsserver, over the fixture in a temp git repo. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-repeated-calls-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function run(): number { return 1; }\n");
  writeFileSync(join(root, "src", "main.ts"), MAIN);
  writeFileSync(join(root, "src", "main.test.ts"), TEST);
  writeFileSync(join(root, "tsconfig.json"), '{ "include": ["src"] }\n');
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture");

  resetStoreForTesting();
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };
  const tools = new Map<string, Tool>();
  piCodegraph({ registerTool: (t: Tool & { name: string }) => tools.set(t.name, t), registerCommand() {}, on() {} } as never);
  return async (tool: string, params: unknown) =>
    (await tools.get(tool)!.execute("c", params, undefined, undefined, { cwd: root })).content[0]!.text;
}

test("symbol_graph's card lists a callee called from four sites once", async () => {
  const call = fixture();
  expect(await call("symbol_graph", { name: "repeat" })).toContain(
    "\n### Key Relationships\n  Callees (1):  run\n    run: () => number\n\n### Signals\n",
  );
});

test("symbol_graph's card lists a caller and a test case calling it from several sites once each", async () => {
  const call = fixture();
  expect(await call("symbol_graph", { name: "run" })).toContain(
    "\n### Key Relationships\n  Callers (1):  repeat\n    repeat: () => void\n  Test callers (1 in 1 file):  src/main.test.ts\n\n### Signals\n",
  );
});

test("symbol_graph's neighborhood lists a callee called from four sites once", async () => {
  const call = fixture();
  expect(await call("symbol_graph", { name: "repeat", include: ["neighborhood"] })).toEndWith(
    "\n### Callees\n  src/a.ts  1:246  run  calls  confidence:0.9  lsp [leaf]\n",
  );
});

test("symbol_graph's neighborhood lists each caller calling from several sites once", async () => {
  const call = fixture();
  expect(await call("symbol_graph", { name: "run", include: ["neighborhood"] })).toEndWith(
    [
      "",
      "### Callers",
      "  src/main.ts  3:6a1  repeat  calls  confidence:0.9  lsp [entry-point]",
      "  src/main.test.ts  4:d54  src/main.test.ts > runs twice  calls  confidence:0.9  lsp",
      "",
    ].join("\n"),
  );
});

test("impact lists a dependent calling from four sites once, and a test case calling twice as one case", async () => {
  const call = fixture();
  expect(await call("impact", { symbols: ["run"], changeType: "behavior_change" })).toEndWith(
    "\n- coverage: unknown, no coverage report indexed\nsrc/main.ts  3:6a1  repeat  behavioral  depth:1\n\nTests reached directly (1 case in 1 file):\nsrc/main.test.ts\n",
  );
});

test("trace lists a callee called from four sites once", async () => {
  const call = fixture();
  expect(await call("trace", { entry: "repeat" })).toEndWith(
    "\nmode: static (heuristic, no runtime evidence)\nsrc/main.ts  3:6a1  repeat [entry-point]\n  src/a.ts  1:246  run [leaf]\n",
  );
});

test("trace on a callback line lists a callee the callback calls twice once", async () => {
  const call = fixture();
  expect(await call("trace", { file: "src/main.ts", line: 6 })).toEndWith(
    "\nmode: static (heuristic, no runtime evidence)\nsrc/main.ts  5:7b9  <anonymous> (in repeat)\n  src/a.ts  1:246  run [leaf]\n",
  );
});
