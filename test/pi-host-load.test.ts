import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { resetStoreForTesting } from "../src/index.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";

// Loads the extension through the installed pi host's real loader (not a mock), exactly as `pi` does.
const entry = resolve(import.meta.dir, "../src/index.ts");
const scratch = mkdtempSync(join(tmpdir(), "pi-cg-host-load-"));
mkdirSync(join(scratch, "agent"), { recursive: true });
for (const project of ["project", "node-project", "readonly-project"]) {
  mkdirSync(join(scratch, project, "src"), { recursive: true });
  writeFileSync(join(scratch, project, "src", "a.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");
}
mkdirSync(join(scratch, "readonly-project", ".codegraph"));

afterAll(() => {
  resetStoreForTesting();
  chmodSync(join(scratch, "readonly-project", ".codegraph"), 0o755);
  rmSync(scratch, { recursive: true, force: true });
});

afterAll(() => {
  resetStoreForTesting();
  rmSync(scratch, { recursive: true, force: true });
});

test("the pi host loads the extension and registers tools, command and lifecycle handlers", async () => {
  const result = await discoverAndLoadExtensions([entry], join(scratch, "project"), join(scratch, "agent"));
  expect(result.errors).toEqual([]);
  const ext = result.extensions.find((e) => e.path.endsWith("src/index.ts"));
  expect(ext).toBeDefined();

  expect([...ext!.tools.keys()].sort()).toEqual(["impact", "symbol_graph", "trace"]);
  expect(ext!.commands.has("codegraph")).toBe(true);
  expect(ext!.handlers.has("session_shutdown")).toBe(true);
  expect(ext!.handlers.has("session_start")).toBe(true);

  const sg: any = ext!.tools.get("symbol_graph");
  const definition = sg.definition ?? sg;
  expect(definition.annotations?.readOnlyHint).toBe(true);
  expect(definition.outputSchema).toBeDefined();

  const out = await definition.execute("c1", { name: "alpha" }, undefined, undefined, { cwd: join(scratch, "project") });
  expect(out.structuredContent.anchors.length).toBeGreaterThan(0);
});

// pi's host is Node: load and call the extension there too, through the same loader, in a `node` child.
const NODE_LOAD = `
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
const [entry, cwd, agentDir, name] = process.argv.slice(1);
const result = await discoverAndLoadExtensions([entry], cwd, agentDir);
const ext = result.extensions[0];
const sg = ext.tools.get("symbol_graph");
const out = await (sg.definition ?? sg).execute("c1", { name }, undefined, undefined, { cwd });
console.log(JSON.stringify({ errors: result.errors, tools: [...ext.tools.keys()].sort(), isError: out.isError ?? false, anchors: out.structuredContent.anchors.length, text: out.content[0].text }));
for (const shutdown of ext.handlers.get("session_shutdown")) await shutdown({}, {});
process.exit(0);
`;

function loadUnderNode(project: string, name: string): { errors: unknown[]; tools: string[]; isError: boolean; anchors: number; text: string } {
  const run = spawnSync("node", ["--input-type=module", "-e", NODE_LOAD, entry, join(scratch, project), join(scratch, "agent"), name], {
    cwd: resolve(import.meta.dir, ".."),
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout.trim().split("\n").at(-1)!);
}

test("the pi host loads the extension and runs a tool under node", () => {
  const report = loadUnderNode("node-project", "alpha");
  expect(report.errors).toEqual([]);
  expect(report.tools).toEqual(["impact", "symbol_graph", "trace"]);
  expect(report.isError).toBe(false);
  expect(report.anchors).toBeGreaterThan(0);
}, 60_000);

test("under node, a read-only graph.db is indexed on a temp copy and left as it was", async () => {
  const root = join(scratch, "readonly-project");
  const dbPath = join(root, ".codegraph", "graph.db");
  const store = new SqliteGraphStore(dbPath);
  const quiet = { definition: async () => null, references: async () => [], implementations: async () => [], shutdown: async () => {} };
  await indexProject(root, store, { lspClientFactory: () => quiet });
  store.close();
  appendFileSync(join(root, "src", "a.ts"), "export function fresh2() {}\n");
  chmodSync(dbPath, 0o444);
  chmodSync(join(root, ".codegraph"), 0o555);
  const sha256 = () => createHash("sha256").update(readFileSync(dbPath)).digest("hex");
  const before = sha256();

  const report = loadUnderNode("readonly-project", "fresh2");
  expect(report.isError, report.text).toBe(false);
  expect(report.text).toStartWith("Trust: fresh\n");
  expect(report.text).not.toContain("indexing-failed");
  expect(sha256()).toBe(before);
}, 60_000);
