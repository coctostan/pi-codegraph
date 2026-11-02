import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraphResult } from "../src/tools/symbol-graph.js";
import { impactResult } from "../src/tools/impact.js";
import { traceResult } from "../src/tools/trace.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-lookup-status-"));
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "a.ts"), "export function alpha() {}\nexport function dup() {}\n");
  writeFileSync(join(projectRoot, "src", "b.ts"), "export function dup() {}\n");
  const store = new SqliteGraphStore();
  const node = (file: string, name: string, line: number) =>
    store.addNode({ id: `${file}::${name}:${line}`, kind: "function", name, file, start_line: line, end_line: line, content_hash: "h" });
  node("src/a.ts", "alpha", 1);
  node("src/a.ts", "dup", 2);
  node("src/b.ts", "dup", 1);
  cleanups.push(() => {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  });
  return { store, projectRoot };
}

test("symbolGraphResult resolves only a name that matches exactly one node", () => {
  const ctx = fixture();
  expect(symbolGraphResult({ name: "alpha", ...ctx }).resolved).toBe(true);
  expect(symbolGraphResult({ name: "missing", ...ctx }).resolved).toBe(false);
  expect(symbolGraphResult({ name: "dup", ...ctx }).resolved).toBe(false);
  expect(symbolGraphResult({ name: "dup", file: "src/b.ts", ...ctx }).resolved).toBe(true);
  expect(symbolGraphResult({ name: "missing", ...ctx }).text).toContain('Symbol "missing" not found');
});

test("impactResult resolves only when every requested symbol matches exactly one node", () => {
  const ctx = fixture();
  expect(impactResult({ symbols: ["alpha"], changeType: "removal", ...ctx }).resolved).toBe(true);
  expect(impactResult({ symbols: ["alpha", "missing"], changeType: "removal", ...ctx }).resolved).toBe(false);
  expect(impactResult({ symbols: ["dup"], changeType: "removal", ...ctx }).resolved).toBe(false);
  expect(impactResult({ symbols: [], changeType: "removal", ...ctx }).resolved).toBe(false);
  expect(impactResult({ symbols: ["alpha"], changeType: "addition", ...ctx }).resolved).toBe(true);
});

test("traceResult resolves only an entry that matches exactly one node", () => {
  const ctx = fixture();
  expect(traceResult({ entry: "alpha", ...ctx }).resolved).toBe(true);
  expect(traceResult({ entry: "missing", ...ctx }).resolved).toBe(false);
  expect(traceResult({ entry: "dup", ...ctx }).resolved).toBe(false);
  expect(traceResult({ entry: "alpha", file: "src/b.ts", ...ctx }).resolved).toBe(false);
  expect(traceResult({ entry: "dup", file: "src/a.ts", ...ctx }).resolved).toBe(true);
});
