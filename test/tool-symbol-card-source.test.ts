import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard includes ### Source section with hashlined content", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "// header\nexport function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:2",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 2,
      end_line: 4,
      content_hash: hash,
      is_exported: true,
      signature: "() => number",
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    // Should contain Source section
    expect(output).toContain("### Source");
    // Should contain hashlined content
    expect(output).toMatch(/2:[a-f0-9]+\|export function foo/);
    expect(output).toMatch(/3:[a-f0-9]+\|  return 1;/);
    expect(output).toMatch(/4:[a-f0-9]+\|}/);

    // Source should appear before Signature
    const sourceIdx = output.indexOf("### Source");
    const sigIdx = output.indexOf("### Signature");
    expect(sourceIdx).toBeGreaterThan(-1);
    expect(sigIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeLessThan(sigIdx);

    // Existing sections still present
    expect(output).toContain("## foo (function)");
    expect(output).toContain("### Exported");
    expect(output).toContain("### Signals");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard Source section shows 'source unavailable' when file does not exist", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-missing-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/gone.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/gone.ts",
      start_line: 1,
      end_line: 5,
      content_hash: "abc123",
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source");
    expect(output).toContain("source unavailable");
    // Should NOT crash or have empty section
    expect(output).toContain("### Signature");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard Source section shows 'source unavailable' when end_line is null", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-nullend-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: null,
      content_hash: hash,
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source");
    expect(output).toContain("source unavailable");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard Source section header includes [stale] when content hash mismatches", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "old-stale-hash",
      is_exported: true,
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Source [stale]");
    // Source content should still be present
    expect(output).toContain("export function foo()");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard truncates source when maxSourceLines is provided", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-src-max-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `  statement_${i + 1};`);
  const fileContent = `function bigFn() {\n${lines.join("\n")}\n}\n`;
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::bigFn:1",
      kind: "function",
      name: "bigFn",
      file: "src/a.ts",
      start_line: 1,
      end_line: 22,
      content_hash: hash,
      is_exported: true,
    });

    const output = symbolCard({ name: "bigFn", store, projectRoot, maxSourceLines: 3 });

    expect(output).toContain("### Source");
    // Should contain first 3 lines
    expect(output).toContain("function bigFn()");
    expect(output).toContain("statement_1");
    expect(output).toContain("statement_2");
    // Should NOT contain line 4+
    expect(output).not.toContain("statement_3");
    // Should show truncation indicator
    expect(output).toMatch(/\(\d+ more lines — use read\(/);

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
