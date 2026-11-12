import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { TsServerClient } from "../src/indexer/tsserver-client.js";

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

const A_RUN = "src/a.ts::run:1";
const B_RUN = "src/b.ts::run:1";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** The fixture in a temp git repo, on this repo's tsserver. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-call-sites-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function run(): number { return 1; }\n");
  writeFileSync(join(root, "src", "b.ts"), "export function run(): number { return 2; }\n");
  writeFileSync(join(root, "src", "main.ts"), MAIN);
  writeFileSync(join(root, "tsconfig.json"), '{ "include": ["src"] }\n');
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  // The client takes a project's own tsserver before one on PATH, which CI's runners lack.
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(join(import.meta.dir, "..", "node_modules", "typescript", "bin", "tsserver"), join(root, "node_modules", ".bin", "tsserver"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture");
  cleanup = () => rmSync(root, { recursive: true, force: true });
  return root;
}

/** Each `calls` row `source` holds, as [target, provenance, call end], in site order. */
function callRows(store: SqliteGraphStore, source: string) {
  return store
    .getEdgesBySource(`src/main.ts::${source}`)
    .filter((e) => e.kind === "calls")
    .map((e) => [e.target, e.provenance.source, `${e.call_end?.line}:${e.call_end?.col}`])
    .sort((a, b) => a[2]!.localeCompare(b[2]!, undefined, { numeric: true }));
}

test("each call site stores its own calls row, resolved to its own target", async () => {
  const root = fixture();
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store);
    expect(callRows(store, "twice:11")).toEqual([
      [A_RUN, "lsp", "13:9"],
      [B_RUN, "lsp", "16:11"],
      [A_RUN, "lsp", "17:9"],
    ]);
    expect(callRows(store, "owner:4")).toEqual([
      [A_RUN, "lsp", "5:7"],
      [B_RUN, "lsp", "7:11"],
    ]);
  } finally {
    store.close();
  }
});

test("a lookup failing at one site leaves that call unresolved while a same-named call resolves", async () => {
  const root = fixture();
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, {
      lspClientFactory: (projectRoot) => {
        const client = new TsServerClient(projectRoot);
        const definition = client.definition.bind(client);
        client.definition = async (file, line, col) => {
          if (file === "src/main.ts" && line === 16) throw new Error("TsServer request timed out");
          return definition(file, line, col);
        };
        return client;
      },
    });
    expect(callRows(store, "twice:11")).toEqual([
      [A_RUN, "lsp", "13:9"],
      ["__unresolved__::run:0", "tree-sitter", "16:11"],
      [A_RUN, "lsp", "17:9"],
    ]);
    expect(store.getFailures()).toEqual([{ kind: "definition", source: "src/main.ts::twice:11", evidence: "run:16:7" }]);
  } finally {
    store.close();
  }
});

test("trace lists a caller's calls to two modules' namesakes, each to its own module", async () => {
  const root = fixture();
  resetStoreForTesting();
  const previous = cleanup;
  cleanup = () => {
    resetStoreForTesting();
    previous?.();
  };
  const tools = new Map<string, { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }> }>();
  piCodegraph({ registerTool: (t: { name: string }) => tools.set(t.name, t as never), registerCommand() {}, on() {} } as never);
  const text = (await tools.get("trace")!.execute("c", { entry: "owner" }, undefined, undefined, { cwd: root })).content[0]!.text;
  expect(text).toContain("\nmode: static (heuristic, no runtime evidence)\nsrc/main.ts  4:");
  const tree = text.slice(text.indexOf("\nsrc/main.ts  4:") + 1);
  expect(tree.split("\n").map((line) => line.replace(/\d+:[0-9a-f]{3}  /, ""))).toEqual([
    "src/main.ts  owner [entry-point]",
    "  src/a.ts  run [leaf]",
    "  src/b.ts  run [leaf]",
    "",
  ]);
});
