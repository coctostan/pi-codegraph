import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { traceResult } from "../src/tools/trace.js";

// The arc's fixture: `owner` calls `run()` from ./a and `b.run()` from ./b; `twice` calls `run()`, `b.run()`, `run()`.
const MAIN = [
  'import { run } from "./a";',
  'import * as b from "./b";',
  "",
  "export function owner(): void {",
  "  run();",
  "  [1].forEach(() => {",
  "    b.run();",
  "  });",
  "}",
  "",
  "export function twice(): void {",
  "  [1].forEach(() => {",
  "    run();",
  "  });",
  "  [2].forEach(() => {",
  "    b.run();",
  "    run();",
  "  });",
  "}",
  "",
].join("\n");

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** `files` in a temp git repo with `src/a.ts` and `src/b.ts`, on this repo's tsserver, and a `trace` on it. */
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-trace-call-sites-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function run(): number { return 1; }\n");
  writeFileSync(join(root, "src", "b.ts"), "export function run(): number { return 2; }\n");
  for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);
  writeFileSync(join(root, "tsconfig.json"), '{ "include": ["src"] }\n');
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  // The client takes a project's own tsserver before one on PATH, which CI's runners lack.
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(join(import.meta.dir, "..", "node_modules", "typescript", "bin", "tsserver"), join(root, "node_modules", ".bin", "tsserver"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture");
  resetStoreForTesting();
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }> }>();
  piCodegraph({ registerTool: (t: { name: string }) => tools.set(t.name, t as never), registerCommand() {}, on() {} } as never);
  return async (params: Record<string, unknown>) => {
    const text = (await tools.get("trace")!.execute("c", params, undefined, undefined, { cwd: root })).content[0]!.text;
    // The tree below the mode header, each line's anchor dropped.
    return text
      .slice(text.indexOf("\n", text.indexOf("mode: ")) + 1)
      .split("\n")
      .map((line) => line.replace(/\d+:[0-9a-f]{3} {2}/, ""));
  };
}

test("a callback's call to a namespace's function traces to that module's function", async () => {
  const trace = fixture({ "src/main.ts": MAIN });
  expect(await trace({ file: "src/main.ts", line: 7 })).toEqual(["src/main.ts  <anonymous> (in owner)", "  src/b.ts  run [leaf]", ""]);
});

test("a callback's calls to two modules' namesakes each trace to their own module, in call order", async () => {
  const trace = fixture({ "src/main.ts": MAIN });
  expect(await trace({ file: "src/main.ts", line: 16 })).toEqual([
    "src/main.ts  <anonymous> (in twice)",
    "  src/b.ts  run [leaf]",
    "  src/a.ts  run [leaf]",
    "",
  ]);
});

test("a callback's call through a re-exported namespace traces where its owner's call at that site resolved", async () => {
  const trace = fixture({
    // `b2` reaches ./b through a re-export, so tree-sitter reads `b2.run()` as another object's member, and a class
    // declaring `run` makes the LSP stage ask tsserver about it.
    "src/ns.ts": 'export * as b2 from "./b";\n',
    "src/k.ts": "export class K { run(): number { return 3; } }\n",
    "src/main.ts": ['import { b2 } from "./ns";', "", "export function viaNs(): void {", "  [1].forEach(() => {", "    b2.run();", "  });", "}", ""].join("\n"),
  });
  expect(await trace({ file: "src/main.ts", line: 5 })).toEqual(["src/main.ts  <anonymous> (in viaNs)", "  src/b.ts  run [leaf]", ""]);
});

test("a callback's member call its owner holds no row for prints unresolved and reads unknown, not dropped", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-trace-call-sites-norow-"));
  mkdirSync(join(projectRoot, "src"));
  writeFileSync(join(projectRoot, "src", "main.ts"), "export function owner(obj: { m(): void }) {\n  [1].map(() => obj.m());\n}\n");
  const store = new SqliteGraphStore();
  cleanup = () => {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  };
  // An index older than the file: `owner` is known, its call at line 2 is not.
  store.addNode({ id: "src/main.ts::owner:1", kind: "function", name: "owner", file: "src/main.ts", start_line: 1, end_line: 3, content_hash: "old", is_exported: true });
  const { text } = traceResult({ file: "src/main.ts", line: 2, store, projectRoot });
  expect(text).toContain("<anonymous> (in owner) [stale]\n  ? m (unresolved, src/main.ts:2)\n");
  // Unknown, not just stale: the call the index lacks outranks the owner's changed hash.
  expect(text.startsWith("Trust: unknown")).toBe(true);
});
