import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { resetStoreForTesting } from "../src/index.js";

// Loads the extension through the installed pi host's real loader (not a mock), exactly as `pi` does.
const entry = resolve(import.meta.dir, "../src/index.ts");
const scratch = mkdtempSync(join(tmpdir(), "pi-cg-host-load-"));
mkdirSync(join(scratch, "agent"), { recursive: true });
mkdirSync(join(scratch, "project", "src"), { recursive: true });
writeFileSync(join(scratch, "project", "src", "a.ts"), "export function alpha() {}\nexport function beta() { alpha(); }\n");

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
