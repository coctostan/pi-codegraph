import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode single symbol reports unreferenced when no inbound edges", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-unref-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function lonely() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    store.setFileHash("src/a.ts", hashA);
    store.addNode({ id: "src/a.ts::lonely:1", kind: "function", name: "lonely", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    const output = deadCode({ name: "lonely", store, projectRoot });
    expect(output).toContain("referenced: no");
    expect(output).toContain("references: 0");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode single symbol returns not-found for unknown symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-notfound-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });
  const store = new SqliteGraphStore();
  try {
    const output = deadCode({ name: "nonexistent", store, projectRoot });
    expect(output).toContain("not found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode single symbol returns disambiguation list for ambiguous symbol", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-ambig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function dup() {}\n";
  const fileB = "export function dup() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  writeFileSync(join(projectRoot, "src/b.ts"), fileB);
  const store = new SqliteGraphStore();
  try {
    const hashA = sha256Hex(fileA);
    const hashB = sha256Hex(fileB);
    store.setFileHash("src/a.ts", hashA);
    store.setFileHash("src/b.ts", hashB);
    store.addNode({ id: "src/a.ts::dup:1", kind: "function", name: "dup", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
    store.addNode({ id: "src/b.ts::dup:1", kind: "function", name: "dup", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hashB, is_exported: true });
    const output = deadCode({ name: "dup", store, projectRoot });
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
