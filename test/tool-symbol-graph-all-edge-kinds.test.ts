import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-alledge-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "export interface IFoo {\n  doStuff(): void;\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export class FooImpl implements IFoo {\n  doStuff() {}\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/c.ts"),
    "export class ChildClass extends FooImpl {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/test.ts"),
    "test('foo', () => {});\n",
  );
  writeFileSync(
    join(projectRoot, "src/cochange.ts"),
    "export function coFn() {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/render.ts"),
    "export function MyComponent() {}\n",
  );
  writeFileSync(
    join(projectRoot, "src/route.ts"),
    "export function getHandler() {}\n",
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

function getHash(projectRoot: string, file: string): string {
  const { sha256Hex } = require("../src/indexer/tree-sitter.js");
  const content = require("node:fs").readFileSync(join(projectRoot, file), "utf-8");
  return sha256Hex(content);
}

test("symbolGraph renders implements edges with direction-aware titles", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashB = getHash(projectRoot, "src/b.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });

    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "implements clause", content_hash: hashB },
      created_at: Date.now(),
    });

    // Query the interface — incoming implements → "Implemented By"
    const ifaceOutput = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(ifaceOutput).toContain("### Implemented By");
    expect(ifaceOutput).toContain("FooImpl");

    // Query the class — outgoing implements → "Implements"
    const classOutput = symbolGraph({ name: "FooImpl", store, projectRoot });
    expect(classOutput).toContain("### Implements");
    expect(classOutput).toContain("IFoo");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders extends edges with direction-aware titles", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashB = getHash(projectRoot, "src/b.ts");
    const hashC = getHash(projectRoot, "src/c.ts");

    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });
    store.addNode({ id: "src/c.ts::ChildClass:1", kind: "class", name: "ChildClass", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: hashC });

    store.addEdge({
      source: "src/c.ts::ChildClass:1",
      target: "src/b.ts::FooImpl:1",
      kind: "extends",
      provenance: { source: "tree-sitter", confidence: 0.8, evidence: "extends clause", content_hash: hashC },
      created_at: Date.now(),
    });

    const parentOutput = symbolGraph({ name: "FooImpl", store, projectRoot });
    expect(parentOutput).toContain("### Extended By");
    expect(parentOutput).toContain("ChildClass");

    const childOutput = symbolGraph({ name: "ChildClass", store, projectRoot });
    expect(childOutput).toContain("### Extends");
    expect(childOutput).toContain("FooImpl");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders tested_by edges with direction-aware titles", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashTest = getHash(projectRoot, "src/test.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/test.ts::fooTest:1", kind: "test", name: "fooTest", file: "src/test.ts", start_line: 1, end_line: 1, content_hash: hashTest });

    store.addEdge({
      source: "src/test.ts::fooTest:1",
      target: "src/a.ts::IFoo:1",
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.7, evidence: "coverage data", content_hash: hashTest },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Tested By");
    expect(output).toContain("fooTest");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders co_changes_with edges as Co-changes With", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashCo = getHash(projectRoot, "src/cochange.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/cochange.ts::coFn:1", kind: "function", name: "coFn", file: "src/cochange.ts", start_line: 1, end_line: 1, content_hash: hashCo });

    store.addEdge({
      source: "src/a.ts::IFoo:1",
      target: "src/cochange.ts::coFn:1",
      kind: "co_changes_with",
      provenance: { source: "git", confidence: 0.6, evidence: "co-change", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Co-changes With");
    expect(output).toContain("coFn");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders renders and routes_to edges", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashRender = getHash(projectRoot, "src/render.ts");
    const hashRoute = getHash(projectRoot, "src/route.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/render.ts::MyComponent:1", kind: "function", name: "MyComponent", file: "src/render.ts", start_line: 1, end_line: 1, content_hash: hashRender });
    store.addNode({ id: "src/route.ts::getHandler:1", kind: "function", name: "getHandler", file: "src/route.ts", start_line: 1, end_line: 1, content_hash: hashRoute });

    store.addEdge({
      source: "src/a.ts::IFoo:1",
      target: "src/render.ts::MyComponent:1",
      kind: "renders",
      provenance: { source: "ast-grep", confidence: 0.7, evidence: "JSX render", content_hash: hashA },
      created_at: Date.now(),
    });

    store.addEdge({
      source: "src/a.ts::IFoo:1",
      target: "src/route.ts::getHandler:1",
      kind: "routes_to",
      provenance: { source: "ast-grep", confidence: 0.7, evidence: "express route", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Renders");
    expect(output).toContain("MyComponent");
    expect(output).toContain("### Routes To");
    expect(output).toContain("getHandler");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph stale check covers all edge kind sections", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: staleHash });

    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "impl", content_hash: staleHash },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("[stale]");
    expect(output).toContain("stale");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph output line format is unchanged — anchor name edgeKind confidence source", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashB = getHash(projectRoot, "src/b.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });

    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "implements",
      provenance: { source: "lsp", confidence: 0.9, evidence: "impl", content_hash: hashB },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    const implLine = output.split("\n").find((l: string) => l.includes("FooImpl"));
    expect(implLine).toBeDefined();
    expect(implLine).toContain("implements");
    expect(implLine).toContain("confidence:0.9");
    expect(implLine).toContain("lsp");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph section order: Callers before Extends before Tested By", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashB = getHash(projectRoot, "src/b.ts");
    const hashC = getHash(projectRoot, "src/c.ts");
    const hashTest = getHash(projectRoot, "src/test.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });
    store.addNode({ id: "src/c.ts::ChildClass:1", kind: "class", name: "ChildClass", file: "src/c.ts", start_line: 1, end_line: 1, content_hash: hashC });
    store.addNode({ id: "src/test.ts::fooTest:1", kind: "test", name: "fooTest", file: "src/test.ts", start_line: 1, end_line: 1, content_hash: hashTest });

    // Caller
    store.addEdge({ source: "src/b.ts::FooImpl:1", target: "src/a.ts::IFoo:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: hashB }, created_at: Date.now() });
    // Extends
    store.addEdge({ source: "src/c.ts::ChildClass:1", target: "src/a.ts::IFoo:1", kind: "extends", provenance: { source: "tree-sitter", confidence: 0.8, evidence: "extends", content_hash: hashC }, created_at: Date.now() });
    // Tested By
    store.addEdge({ source: "src/test.ts::fooTest:1", target: "src/a.ts::IFoo:1", kind: "tested_by", provenance: { source: "coverage", confidence: 0.7, evidence: "cov", content_hash: hashTest }, created_at: Date.now() });

    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    const callersIdx = output.indexOf("### Callers");
    const extendedByIdx = output.indexOf("### Extended By");
    const testedByIdx = output.indexOf("### Tested By");

    expect(callersIdx).toBeGreaterThan(-1);
    expect(extendedByIdx).toBeGreaterThan(-1);
    expect(testedByIdx).toBeGreaterThan(-1);
    expect(callersIdx).toBeLessThan(extendedByIdx);
    expect(extendedByIdx).toBeLessThan(testedByIdx);

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph renders incoming imports as Imported By", () => {
  const { projectRoot, cleanup } = setupFixture();
  try {
    const store = new SqliteGraphStore();
    const hashA = getHash(projectRoot, "src/a.ts");
    const hashB = getHash(projectRoot, "src/b.ts");

    store.addNode({ id: "src/a.ts::IFoo:1", kind: "interface", name: "IFoo", file: "src/a.ts", start_line: 1, end_line: 3, content_hash: hashA });
    store.addNode({ id: "src/b.ts::FooImpl:1", kind: "class", name: "FooImpl", file: "src/b.ts", start_line: 1, end_line: 2, content_hash: hashB });

    // FooImpl imports IFoo (outgoing from FooImpl, incoming to IFoo)
    store.addEdge({
      source: "src/b.ts::FooImpl:1",
      target: "src/a.ts::IFoo:1",
      kind: "imports",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashB },
      created_at: Date.now(),
    });

    // Query IFoo — incoming imports → "Imported By"
    const output = symbolGraph({ name: "IFoo", store, projectRoot });
    expect(output).toContain("### Imported By");
    expect(output).toContain("FooImpl");

    store.close();
  } finally {
    cleanup();
  }
});