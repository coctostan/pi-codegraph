import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows neighbor signatures in Key Relationships", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nbsig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() { bar(); }\n";
  const fileBContent = "export function bar(x: number): string { return String(x); }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts",
      start_line: 1, end_line: 1, content_hash: hashA, is_exported: true,
      signature: "() => void",
    });
    store.addNode({
      id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts",
      start_line: 1, end_line: 1, content_hash: hashB, is_exported: true,
      signature: "(x: number) => string",
    });
    // foo calls bar
    store.addEdge({
      source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    // Neighbor signature should appear
    expect(output).toContain("(x: number) => string");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard omits signature line for neighbors without a signature", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-nbnosig-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileAContent = "export function foo() { bar(); }\n";
  const fileBContent = "export function bar() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileAContent);
  writeFileSync(join(projectRoot, "src/b.ts"), fileBContent);
  const hashA = sha256Hex(fileAContent);
  const hashB = sha256Hex(fileBContent);

  try {
    const store = new SqliteGraphStore();
    store.addNode({
      id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts",
      start_line: 1, end_line: 1, content_hash: hashA, is_exported: true,
    });
    // bar has NO signature
    store.addNode({
      id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts",
      start_line: 1, end_line: 1, content_hash: hashB, is_exported: true,
    });
    store.addEdge({
      source: "src/a.ts::foo:1", target: "src/b.ts::bar:1", kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "foo", store, projectRoot });

    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    // Should NOT have "not available" for neighbor signature
    const relSection = output.slice(output.indexOf("### Key Relationships"));
    expect(relSection).not.toContain("not available");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
