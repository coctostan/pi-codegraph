import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { suppressFreshTrustHeader } from "../src/output/read-only-ceremony.js";
import { renderLegacyNeighborhoodBody, symbolGraph } from "../src/tools/symbol-graph.js";
import { renderSymbolSourceSection, symbolCard } from "../src/tools/symbol-card.js";

function setupSourceFixture(): { projectRoot: string; store: SqliteGraphStore; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-source-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const srcContent = "export function foo() {\n  return 1;\n}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), srcContent);

  const store = new SqliteGraphStore();
  const srcHash = sha256Hex(srcContent);
  store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 3, content_hash: srcHash, is_exported: true, signature: "() => number" });
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("include:['source'] appends the shared source section to the compact card base", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const base = symbolGraph({ name: "foo", store, projectRoot });
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });
    const withSource = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });

    expect(withSource.startsWith(base)).toBe(true);
    expect(withSource.slice(base.length)).toBe(`\n${source.body}`);
    expect(withSource).not.toContain("### Source\n### Source");
  } finally {
    cleanup();
  }
});

test("include:['neighborhood','source'] keeps neighborhood as the active base and appends source after it", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const neighborhoodBody = renderLegacyNeighborhoodBody({ name: "foo", store, projectRoot }).body;
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });
    const withSource = suppressFreshTrustHeader(symbolGraph({ name: "foo", include: ["neighborhood", "source"] as any, store, projectRoot }));

    expect(withSource.startsWith(neighborhoodBody)).toBe(true);
    expect(withSource.slice(neighborhoodBody.length)).toBe(`\n${source.body}`);
  } finally {
    cleanup();
  }
});

test("include:['contract','source'] appends contract then source after the active base", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const withBoth = symbolGraph({ name: "foo", include: ["contract", "source"] as any, store, projectRoot });
    const contractIdx = withBoth.indexOf("## Contract: foo");
    const sourceIdx = withBoth.indexOf("### Source");

    expect(contractIdx).toBeGreaterThan(-1);
    expect(sourceIdx).toBeGreaterThan(contractIdx);
  } finally {
    cleanup();
  }
});

test("include:['source'] returns a single explicit not-found output", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const base = symbolGraph({ name: "doesNotExist", store, projectRoot });
    const missing = symbolGraph({ name: "doesNotExist", include: ["source"] as any, store, projectRoot });
    expect(missing).toBe(base);
    expect(missing).toContain('Symbol "doesNotExist" not found');
    expect((missing.match(/Symbol "doesNotExist" not found/g) ?? []).length).toBe(1);
  } finally {
    cleanup();
  }
});

test("include:['source'] returns a single explicit ambiguity output", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const dupContent = "export class foo {}\n";
    writeFileSync(join(projectRoot, "src/dup.ts"), dupContent);
    const dupHash = sha256Hex(dupContent);
    store.addNode({
      id: "src/dup.ts::foo:1",
      kind: "class",
      name: "foo",
      file: "src/dup.ts",
      start_line: 1,
      end_line: 1,
      content_hash: dupHash,
    });
    const ambiguous = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });
    expect((ambiguous.match(/Multiple matches for "foo":/g) ?? []).length).toBe(1);
    expect(ambiguous).toContain("src/foo.ts");
    expect(ambiguous).toContain("src/dup.ts");
  } finally {
    cleanup();
  }
});

test("symbolCard routes its Source section through renderSymbolSourceSection for AC 15", () => {
  const { projectRoot, store, cleanup } = setupSourceFixture();
  try {
    const standalone = symbolCard({ name: "foo", store, projectRoot });
    const source = renderSymbolSourceSection({ name: "foo", store, projectRoot });

    // The shared helper body (e.g. `### Source\n<snippet>\n`) must appear inside the
    // standalone card output, proving symbolCard() now reuses the shared renderer.
    expect(standalone).toContain(source.body.trimEnd());
  } finally {
    cleanup();
  }
});
