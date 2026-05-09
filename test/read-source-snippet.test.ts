import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceSnippet } from "../src/output/source.js";
import { computeLineHash, ensureHashInit } from "../src/output/anchoring.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import type { GraphNode } from "../src/graph/types.js";

test("readSourceSnippet returns hashlined source for a valid node", async () => {
  await ensureHashInit();
  const projectRoot = join(tmpdir(), `pi-cg-src-happy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nline two\nline three\nline four\nline five\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:2",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 2,
    end_line: 4,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    const lines = result!.text.split("\n").filter((l) => l.length > 0);
    expect(lines).toEqual([
      `2:${computeLineHash(2, "line two")}|line two`,
      `3:${computeLineHash(3, "line three")}|line three`,
      `4:${computeLineHash(4, "line four")}|line four`,
    ]);
    for (const line of lines) {
      expect(line).toMatch(/^\d+:[a-f0-9]{3}\|/);
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet returns null when file does not exist on disk", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-missing-${Date.now()}`);
  mkdirSync(projectRoot, { recursive: true });

  const node: GraphNode = {
    id: "src/gone.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/gone.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "abc123",
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet returns null when end_line is null", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-nullend-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: null,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet truncates when source exceeds maxLines", async () => {
  await ensureHashInit();
  const projectRoot = join(tmpdir(), `pi-cg-src-trunc-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 20,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 5);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(15);
    expect(result!.text).toContain("line 1");
    expect(result!.text).toContain("line 5");
    expect(result!.text).not.toContain("|line 6");
    // Truncation notice now includes a read() continuation hint.
    expect(result!.text).toContain("15 more lines");
    expect(result!.text).toContain("src/a.ts");
    expect(result!.text).toMatch(/offset:\s*6\b/);
    expect(result!.text).toMatch(/limit:\s*15\b/);
    expect(result!.text).toMatch(/read\(/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet sets stale=true when content hash mismatches", async () => {
  await ensureHashInit();
  const projectRoot = join(tmpdir(), `pi-cg-src-stale-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "old-stale-hash",
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(true);
    // Should still contain the source
    expect(result!.text).toContain("export function foo()");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet sets stale=false when content hash matches", async () => {
  await ensureHashInit();
  const projectRoot = join(tmpdir(), `pi-cg-src-fresh-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot);
    expect(result).not.toBeNull();
    expect(result!.stale).toBe(false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("readSourceSnippet returns null for invalid requested line ranges", async () => {
  await ensureHashInit();
  const projectRoot = join(tmpdir(), `pi-cg-src-invalid-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "line one\nline two\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 2,
    content_hash: hash,
  };

  try {
    expect(readSourceSnippet({ ...node, start_line: 0, end_line: 1 }, projectRoot)).toBeNull();
    expect(readSourceSnippet({ ...node, start_line: 2, end_line: 99 }, projectRoot)).toBeNull();
    expect(readSourceSnippet({ ...node, start_line: 3, end_line: 2 }, projectRoot)).toBeNull();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
