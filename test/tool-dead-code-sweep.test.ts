import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode sweep mode finds exported symbols with zero inbound edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function used() {}\n";
  const fileB = "export function unused() {}\n";
  const fileC = "import { used } from './a';\nexport function caller() { used(); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  writeFileSync(join(projectRoot, "src/c.ts"), fileC);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    const hashC = sha256Hex(fileC);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.setFileHash("src/c.ts", hashC);
    store.addNode({ id: "src/a.ts::used:1", kind: "function", name: "used", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::unused:1", kind: "function", name: "unused", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    store.addNode({ id: "src/c.ts::caller:2", kind: "function", name: "caller", file: "src/c.ts", start_line: 2, end_line: 2, content_hash: hashC, is_exported: true });
    store.addEdge({ source: "src/c.ts::caller:2", target: "src/a.ts::used:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashC }, created_at: Date.now() });
    const output = deadCode({ store, projectRoot });
    expect(output).toContain("## Trust");
    expect(output).toContain("unused");
    expect(output).toContain("caller");
    expect(output).not.toContain("used  function  src/a.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode excludes non-exported symbols", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-noexport-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "function internal() {}\nexport function exported() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::internal:1", kind: "function", name: "internal", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: false });
    store.addNode({ id: "src/a.ts::exported:2", kind: "function", name: "exported", file: "src/a.ts", start_line: 2, end_line: 2, content_hash: hashA, is_exported: true });
    const output = deadCode({ store, projectRoot });
    expect(output).toContain("exported");
    expect(output).not.toContain("internal");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode sorts by file then name", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-sweep-sort-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function zeta() {}\nexport function alpha() {}\n";
  const fileB = "export function beta() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.addNode({ id: "src/a.ts::zeta:1", kind: "function", name: "zeta", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/a.ts::alpha:2", kind: "function", name: "alpha", file: "src/a.ts", start_line: 2, end_line: 2, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::beta:1", kind: "function", name: "beta", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    const output = deadCode({ store, projectRoot });
    const alphaIdx = output.indexOf("alpha");
    const zetaIdx = output.indexOf("zeta");
    const betaIdx = output.indexOf("beta");
    expect(alphaIdx).toBeLessThan(zetaIdx);
    expect(zetaIdx).toBeLessThan(betaIdx);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
