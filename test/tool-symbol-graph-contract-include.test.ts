import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import * as symbolContractTool from "../src/tools/symbol-contract.js";

function setupContractFixture(): { projectRoot: string; store: SqliteGraphStore; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-contract-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  mkdirSync(join(projectRoot, "test"), { recursive: true });

  const srcContent = [
    "export function validate(input: string): boolean {",
    "  if (!input) return false;",
    '  if (input.length === 0) throw new Error("empty input");',
    "  return true;",
    "}",
    "",
  ].join("\n");
  const testContent = [
    'test("returns true for valid input", () => {',
    '  expect(validate("good")).toBe(true);',
    "});",
    "",
  ].join("\n");
  writeFileSync(join(projectRoot, "src/validate.ts"), srcContent);
  writeFileSync(join(projectRoot, "test/validate.test.ts"), testContent);
  const store = new SqliteGraphStore();
  const srcHash = sha256Hex(srcContent);
  const testHash = sha256Hex(testContent);
  store.addNode({
    id: "src/validate.ts::validate:1",
    kind: "function",
    name: "validate",
    file: "src/validate.ts",
    start_line: 1,
    end_line: 4,
    content_hash: srcHash,
    is_exported: true,
    signature: "(input: string) => boolean",
  });
  store.addNode({
    id: "test/validate.test.ts::returns true for valid input:1",
    kind: "test",
    name: "returns true for valid input",
    file: "test/validate.test.ts",
    start_line: 1,
    end_line: 3,
    content_hash: testHash,
  });
  store.addEdge({
    source: "src/validate.ts::validate:1",
    target: "test/validate.test.ts::returns true for valid input:1",
    kind: "tested_by",
    provenance: { source: "coverage", confidence: 0.9, evidence: "covered", content_hash: srcHash },
    created_at: Date.now(),
  });
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("symbolGraph appends the standalone symbol_contract body when include contains contract", () => {
  const renderSymbolContractBody = (symbolContractTool as any).renderSymbolContractBody as
    | ((params: { name: string; file?: string; store: SqliteGraphStore; projectRoot: string }) => { body: string; hasLocalExceptions: boolean })
    | undefined;
  if (typeof renderSymbolContractBody !== "function") {
    throw new Error("renderSymbolContractBody is not exported from symbol-contract");
  }

  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "validate", store, projectRoot });
    const rendered = renderSymbolContractBody({ name: "validate", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "validate", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "validate", include: ["contract"] as any, store, projectRoot });
    expect(standaloneBody).toBe(rendered.body);
    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});

test("symbolGraph appends the standalone symbol_contract empty state when include contains contract for an unknown symbol", () => {
  const { projectRoot, store, cleanup } = setupContractFixture();
  try {
    const base = symbolGraph({ name: "doesNotExist", store, projectRoot });
    const standaloneBody = suppressFreshTrustHeader(
      symbolContractTool.symbolContract({ name: "doesNotExist", store, projectRoot }),
    );
    const withContract = symbolGraph({ name: "doesNotExist", include: ["contract"] as any, store, projectRoot });

    expect(withContract.startsWith(base)).toBe(true);
    expect(withContract.slice(base.length)).toBe(`\n\n${standaloneBody}`);
    expect((withContract.match(/## Trust/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});
