import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolContract } from "../src/tools/symbol-contract.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolContract renders full contract with takes, returns, throws, guards, and test behaviors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-contract-happy-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const srcContent = 'export function validate(input: string): boolean {\n  if (!input) return false;\n  if (input.length === 0) throw new Error("empty input");\n  if (input === "bad") throw new ValidationError("invalid");\n  return true;\n}\n';
  const testContent = 'test("returns true for valid input", () => {\n  expect(validate("good")).toBe(true);\n});\ntest("throws on empty", () => {\n  expect(() => validate("")).toThrow("empty input");\n});\n';
  writeFileSync(join(projectRoot, "src/validate.ts"), srcContent);
  writeFileSync(join(projectRoot, "test/validate.test.ts"), testContent);

  try {
    const store = new SqliteGraphStore();
    const hash = sha256Hex(srcContent);
    const testHash = sha256Hex(testContent);

    store.addNode({
      id: "src/validate.ts::validate:1", kind: "function", name: "validate",
      file: "src/validate.ts", start_line: 1, end_line: 6,
      content_hash: hash, is_exported: true, signature: "(input: string) => boolean",
    });
    store.addNode({
      id: "test/validate.test.ts::returns true for valid input:1", kind: "test",
      name: "returns true for valid input", file: "test/validate.test.ts",
      start_line: 1, end_line: 3, content_hash: testHash,
    });
    store.addNode({
      id: "test/validate.test.ts::throws on empty:4", kind: "test",
      name: "throws on empty", file: "test/validate.test.ts",
      start_line: 4, end_line: 6, content_hash: testHash,
    });

    store.addEdge({
      source: "src/validate.ts::validate:1",
      target: "test/validate.test.ts::returns true for valid input:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hash },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/validate.ts::validate:1",
      target: "test/validate.test.ts::throws on empty:4",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: hash },
      created_at: Date.now(),
    });

    const output = symbolContract({ name: "validate", store, projectRoot });

    expect(output).toContain("## Trust");
    expect(output).toContain("## Contract: validate");
    expect(output).toContain("src/validate.ts:1:");
    expect(output).toContain("### Takes");
    expect(output).toContain("input: string");
    expect(output).toContain("### Returns");
    expect(output).toContain("boolean");
    expect(output).toContain("### Throws / Error paths");
    expect(output).toContain("empty input");
    expect(output).toContain("ValidationError");
    expect(output).toContain("### Guards / Preconditions");
    expect(output).toContain("!input");
    expect(output).toContain("### Test-evidenced behaviors");
    expect(output).toContain("returns true for valid input");
    expect(output).toContain("toBe");
    expect(output).toContain("throws on empty");
    expect(output).toContain("toThrow");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
