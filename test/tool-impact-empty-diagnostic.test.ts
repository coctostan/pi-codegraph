import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { impact } from "../src/tools/impact.js";

function tmpProject(): string {
  const root = join(tmpdir(), `pi-cg-impact-diag-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

test("impact() entry-point seed — fanIn 0, no callers — emits entry-point diagnostic", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "entry.ts"), "export function entryPoint() { return 1; }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/entry.ts::entryPoint:1", kind: "function", name: "entryPoint", file: "src/entry.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    const out = impact({ symbols: ["entryPoint"], changeType: "signature_change", store, projectRoot, maxDepth: 5 });
    expect(out).toContain("Trust: stale");
    expect(out).toContain("No dependents found — 'entryPoint' is an entry point with no callers.");
    // Diagnostic must end with a trailing newline so downstream callers aren't glued to it.
    expect(out.endsWith("\n")).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() interface seed without implementors — emits interface diagnostic", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "iface.ts"), "export interface GraphStore { get(): number }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/iface.ts::GraphStore:1", kind: "interface", name: "GraphStore", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    const out = impact({ symbols: ["GraphStore"], changeType: "removal", store, projectRoot, maxDepth: 5 });
    expect(out).toContain("Trust: stale");
    expect(out).toContain("No call-edge dependents found for interface 'GraphStore'. Consider checking implementors via symbol_graph.");
    expect(out.endsWith("\n")).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() genuinely isolated symbol (non-entry, non-interface, no inbound) falls back to isolated diagnostic", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "util.ts"), "export function sha256Hex() { return ''; }\n");
  const store = new SqliteGraphStore();
  try {
    // Not exported → not an entry-point per signal roles; not an interface; no inbound edges.
    store.addNode({ id: "src/util.ts::sha256Hex:1", kind: "function", name: "sha256Hex", file: "src/util.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: false });

    const out = impact({ symbols: ["sha256Hex"], changeType: "removal", store, projectRoot, maxDepth: 5 });
    expect(out).toContain("Trust: stale");
    expect(out).toContain("No dependents found for 'sha256Hex' within depth 5.");
    expect(out.endsWith("\n")).toBe(true);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() multiple seeds with mixed empty categories — one line per seed (stable order)", () => {
  const projectRoot = tmpProject();
  writeFileSync(join(projectRoot, "src", "entry.ts"), "export function entryPoint() { return 1; }\n");
  writeFileSync(join(projectRoot, "src", "iface.ts"), "export interface GraphStore { get(): number }\n");
  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/entry.ts::entryPoint:1", kind: "function", name: "entryPoint", file: "src/entry.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
    store.addNode({ id: "src/iface.ts::GraphStore:1", kind: "interface", name: "GraphStore", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });

    const out = impact({ symbols: ["entryPoint", "GraphStore"], changeType: "signature_change", store, projectRoot, maxDepth: 5 });
    const entryIdx = out.indexOf("'entryPoint' is an entry point");
    const ifaceIdx = out.indexOf("interface 'GraphStore'");
    expect(entryIdx).toBeGreaterThan(-1);
    expect(ifaceIdx).toBeGreaterThan(-1);
    // Stable: entryPoint was listed first → its diagnostic appears before GraphStore's.
    expect(entryIdx).toBeLessThan(ifaceIdx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
