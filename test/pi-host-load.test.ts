import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { resetStoreForTesting } from "../src/index.js";

// Loads the extension through the installed pi host's real loader (not a mock), exactly as `pi` does.
const entry = resolve(import.meta.dir, "../src/index.ts");
const scratch = mkdtempSync(join(tmpdir(), "pi-cg-host-load-"));
mkdirSync(join(scratch, "agent"), { recursive: true });
for (const project of ["project", "node-project"]) {
  mkdirSync(join(scratch, project, "src"), { recursive: true });
  writeFileSync(join(scratch, project, "src", "a.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");
}

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
const [entry, cwd, agentDir] = process.argv.slice(1);
const result = await discoverAndLoadExtensions([entry], cwd, agentDir);
const ext = result.extensions[0];
const sg = ext.tools.get("symbol_graph");
const out = await (sg.definition ?? sg).execute("c1", { name: "alpha" }, undefined, undefined, { cwd });
console.log(JSON.stringify({ errors: result.errors, tools: [...ext.tools.keys()].sort(), isError: out.isError ?? false, anchors: out.structuredContent.anchors.length }));
process.exit(0);
`;

test("the pi host loads the extension and runs a tool under node", () => {
  const run = spawnSync("node", ["--input-type=module", "-e", NODE_LOAD, entry, join(scratch, "node-project"), join(scratch, "agent")], {
    cwd: resolve(import.meta.dir, ".."),
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(run.status, run.stderr).toBe(0);
  const report = JSON.parse(run.stdout.trim().split("\n").at(-1)!);
  expect(report.errors).toEqual([]);
  expect(report.tools).toEqual(["impact", "symbol_graph", "trace"]);
  expect(report.isError).toBe(false);
  expect(report.anchors).toBeGreaterThan(0);
}, 60_000);
