import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import piCodegraph, { resetStoreForTesting, setTsServerClientFactoryForTesting } from "../src/index.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { evaluateFreshness } from "../src/output/freshness.js";

type Tool = { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }> };

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
].join("\n");

// Every call resolves to `src/a.ts run`, so a result's only gap is what the test adds.
const answering: ITsServerClient = {
  definition: async () => ({ file: "src/a.ts", line: 1, col: 17 }),
  references: async () => [],
  implementations: async () => [],
  shutdown: async () => {},
};
const timingOut: ITsServerClient = {
  ...answering,
  definition: async () => {
    throw new Error("TsServer request timed out: definition");
  },
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** The extension on the arc's fixture in a temp git repo, each of `unreadable` a committed `src/` file at mode 000. */
function fixture(unreadable: string[], client: ITsServerClient = answering) {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-index-error-rec-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export function run(): number { return 1; }\n");
  writeFileSync(join(root, "src", "b.ts"), "export function run(): number { return 2; }\n");
  writeFileSync(join(root, "src", "main.ts"), MAIN);
  writeFileSync(join(root, "tsconfig.json"), '{ "include": ["src"] }\n');
  for (const file of unreadable) writeFileSync(join(root, "src", file), "export function lost(): number { return 3; }\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "fixture");
  for (const file of unreadable) chmodSync(join(root, "src", file), 0o000);

  resetStoreForTesting();
  setTsServerClientFactoryForTesting(() => client);
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };
  const tools = new Map<string, Tool>();
  piCodegraph({ registerTool: (t: Tool & { name: string }) => tools.set(t.name, t), registerCommand() {}, on() {} } as never);
  return async (tool: string, params: unknown) =>
    (await tools.get(tool)!.execute("c", params, undefined, undefined, { cwd: root })).content[0]!.text;
}

const recommendation = (text: string) => text.split("\n").find((line) => line.startsWith("- recommendation: ")) ?? "";

test("a result whose only gap is a lost file recommends fixing that file, not a refresh", async () => {
  const call = fixture(["c.ts"]);
  for (const [tool, params] of [
    ["trace", { entry: "owner" }],
    ["impact", { symbols: ["owner"], changeType: "behavior_change" }],
    ["symbol_graph", { name: "owner" }],
  ] as const) {
    const text = await call(tool, params);
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toContain("\n- index errors: src/c.ts\n");
    expect(recommendation(text)).toContain("src/c.ts");
    expect(recommendation(text)).not.toContain("refresh index");
  }
});

test("a result partial from a failed tsserver lookup still recommends a refresh", async () => {
  const call = fixture([], timingOut);
  const text = await call("trace", { entry: "owner" });
  expect(text).toStartWith("Trust: partial\n");
  expect(text).toContain("\n- lookups failed: ");
  expect(recommendation(text)).toContain("refresh index");
});

test("a failed lookup beside a lost file keeps the refresh", async () => {
  const call = fixture(["c.ts"], timingOut);
  const text = await call("trace", { entry: "owner" });
  expect(text).toContain("\n- lookups failed: ");
  expect(text).toContain("\n- index errors: src/c.ts\n");
  expect(recommendation(text)).toContain("refresh index");
});

test("the recommendation names 5 lost files, then counts the rest, as the index-errors line does", async () => {
  const call = fixture(["c1.ts", "c2.ts", "c3.ts", "c4.ts", "c5.ts", "c6.ts", "c7.ts"]);
  const rec = recommendation(await call("trace", { entry: "owner" }));
  expect(rec).toContain("src/c1.ts, src/c2.ts, src/c3.ts, src/c4.ts, src/c5.ts, +2 more");
  expect(rec).not.toContain("src/c6.ts");
  expect(rec).not.toContain("refresh index");
});

test("a changed file beside a lost file keeps the refresh, whether the result reads partial or stale", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-index-error-rec-"));
  const store = new SqliteGraphStore();
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export function run(): number { return 1; }\n");
    const run: GraphNode = {
      id: "src/a.ts::run:1",
      kind: "function",
      name: "run",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "the hash before an edit",
      is_exported: true,
    };
    store.addNode(run);
    store.setFailed({ kind: "index", source: "src/c.ts", evidence: "read" }, true);
    const partial = evaluateFreshness({ store, projectRoot: root, resultNodes: [run] });
    const stale = evaluateFreshness({ store, projectRoot: root, targetNodes: [run], resultNodes: [run] });
    expect([partial.status, stale.status]).toEqual(["partial", "stale"]);
    for (const report of [partial, stale]) {
      expect(report.indexErrors).toEqual(["src/c.ts"]);
      expect(report.recommendation).toBe("refresh index before relying on this result");
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
