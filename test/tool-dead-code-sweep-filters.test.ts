import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { deadCode } from "../src/tools/dead-code.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("deadCode sweep mode filters by kind", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-fk-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fA = "export function foo() {}\n";
  const fB = "export class Bar {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fA);
  writeFileSync(join(projectRoot, "src/b.ts"), fB);
  const store = new SqliteGraphStore();
  try {
    const hA = sha256Hex(fA);
    const hB = sha256Hex(fB);
    store.setFileHash("src/a.ts", hA);
    store.setFileHash("src/b.ts", hB);
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hA, is_exported: true });
    store.addNode({ id: "src/b.ts::Bar:1", kind: "class", name: "Bar", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: hB, is_exported: true });
    const output = deadCode({ kind: "function", store, projectRoot });
    expect(output).toContain("foo");
    expect(output).not.toContain("Bar");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode filters by glob", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-fg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src/tools"), { recursive: true });
  mkdirSync(join(projectRoot, "src/graph"), { recursive: true });
  const fA = "export function toolFn() {}\n";
  const fB = "export function graphFn() {}\n";
  writeFileSync(join(projectRoot, "src/tools/a.ts"), fA);
  writeFileSync(join(projectRoot, "src/graph/b.ts"), fB);
  const store = new SqliteGraphStore();
  try {
    const hA = sha256Hex(fA);
    const hB = sha256Hex(fB);
    store.setFileHash("src/tools/a.ts", hA);
    store.setFileHash("src/graph/b.ts", hB);
    store.addNode({ id: "src/tools/a.ts::toolFn:1", kind: "function", name: "toolFn", file: "src/tools/a.ts", start_line: 1, end_line: 1, content_hash: hA, is_exported: true });
    store.addNode({ id: "src/graph/b.ts::graphFn:1", kind: "function", name: "graphFn", file: "src/graph/b.ts", start_line: 1, end_line: 1, content_hash: hB, is_exported: true });
    const output = deadCode({ glob: "src/tools/*", store, projectRoot });
    expect(output).toContain("toolFn");
    expect(output).not.toContain("graphFn");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("deadCode sweep mode returns empty message when no matches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-dc-fe-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });
  const store = new SqliteGraphStore();
  try {
    const output = deadCode({ store, projectRoot });
    expect(output).toContain("No unreferenced exported symbols found");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
