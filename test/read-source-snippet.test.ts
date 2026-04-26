import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceSnippet } from "../src/output/source.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import type { GraphNode } from "../src/graph/types.js";

test("readSourceSnippet returns hashlined source for a valid node", () => {
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
    // Should contain 3 lines (2, 3, 4)
    const lines = result!.text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    // Each line should be in hashline format: LINE:HASH|content
    for (const line of lines) {
      expect(line).toMatch(/^\d+:[a-f0-9]+\|/);
    }
    // Should contain the actual content
    expect(result!.text).toContain("line two");
    expect(result!.text).toContain("line three");
    expect(result!.text).toContain("line four");
    // Line numbers should be correct
    expect(lines[0]).toMatch(/^2:/);
    expect(lines[1]).toMatch(/^3:/);
    expect(lines[2]).toMatch(/^4:/);
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

test("readSourceSnippet truncates when source exceeds maxLines", () => {
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

test("readSourceSnippet sets stale=true when content hash mismatches", () => {
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

test("readSourceSnippet sets stale=false when content hash matches", () => {
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
