import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFooBar(): {
  projectRoot: string;
  store: SqliteGraphStore;
  cleanup: () => void;
} {
  const projectRoot = join(tmpdir(), `pi-cg-symbol-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fooV1 = "export function foo() { return bar(); }\n";
  const barV1 = "export function bar() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "foo.ts"), fooV1);
  writeFileSync(join(projectRoot, "src", "bar.ts"), barV1);
  const fooHash = sha256Hex(fooV1);
  const barHash = sha256Hex(barV1);
  const store = new SqliteGraphStore();
  store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: fooHash, is_exported: true });
  store.addNode({ id: "src/bar.ts::bar:1", kind: "function", name: "bar", file: "src/bar.ts", start_line: 1, end_line: 1, content_hash: barHash, is_exported: true });
  store.addEdge({ source: "src/foo.ts::foo:1", target: "src/bar.ts::bar:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.8, evidence: "foo calls bar", content_hash: fooHash }, created_at: 1 });
  store.setFileHash("src/foo.ts", fooHash);
  store.setFileHash("src/bar.ts", barHash);
  return {
    projectRoot,
    store,
    cleanup: () => {
      store.close();
      rmSync(projectRoot, { recursive: true, force: true });
    },
  };
}

test("symbolGraph reports partial freshness for stale returned neighborhood evidence", () => {
  const { projectRoot, store, cleanup } = setupFooBar();
  try {
    const fresh = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(fresh.split("\n")[0]).toBe("Trust: fresh");

    writeFileSync(join(projectRoot, "src", "bar.ts"), "export function bar() { return 2; }\n");
    const partial = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(partial).toContain("Trust: partial");
    expect(partial).toContain("changed files: src/bar.ts");
    expect(partial).toContain("affected symbols: bar");
    expect(partial).toContain("bar  calls  confidence:0.8  tree-sitter [stale]");
  } finally {
    cleanup();
  }
});

test("symbolGraph reports stale freshness when the target symbol file changed", () => {
  const { projectRoot, store, cleanup } = setupFooBar();
  try {
    writeFileSync(join(projectRoot, "src", "foo.ts"), "export function foo() { return bar() + 1; }\n");
    const stale = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });
    expect(stale).toContain("Trust: stale");
    expect(stale).toContain("changed files: src/foo.ts");
    expect(stale).toContain("affected symbols: bar, foo");
  } finally {
    cleanup();
  }
});

test("symbolGraph freshness ignores stale neighbors omitted by the rendered limit", () => {
  const projectRoot = join(tmpdir(), `pi-cg-symbol-limit-freshness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const root = "export function root() { return 1; }\n";
  writeFileSync(join(projectRoot, "src", "root.ts"), root);
  const rootHash = sha256Hex(root);
  const store = new SqliteGraphStore();

  try {
    store.addNode({ id: "src/root.ts::root:1", kind: "function", name: "root", file: "src/root.ts", start_line: 1, end_line: 1, content_hash: rootHash, is_exported: true });
    store.setFileHash("src/root.ts", rootHash);

    for (let i = 0; i < 3; i++) {
      const file = `src/dep${i}.ts`;
      const name = `dep${i}`;
      const content = `export function ${name}() { return ${i}; }\n`;
      writeFileSync(join(projectRoot, file), content);
      const hash = sha256Hex(content);
      const id = `${file}::${name}:1`;
      store.addNode({ id, kind: "function", name, file, start_line: 1, end_line: 1, content_hash: hash, is_exported: true });
      store.addEdge({ source: "src/root.ts::root:1", target: id, kind: "calls", provenance: { source: "tree-sitter", confidence: i === 2 ? 0.1 : 0.9, evidence: `${name}:1`, content_hash: rootHash }, created_at: i + 1 });
      store.setFileHash(file, hash);
    }

    writeFileSync(join(projectRoot, "src", "dep2.ts"), "export function dep2() { return 99; }\n");
    const output = symbolGraph({ name: "root", include: ["neighborhood"], limit: 2, store, projectRoot });
    expect(output.split("\n")[0]).toBe("Trust: fresh");
    expect(output).toContain("dep0");
    expect(output).toContain("dep1");
    expect(output).not.toContain("dep2");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
