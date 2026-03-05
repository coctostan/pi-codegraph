import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function setupFixture(): { projectRoot: string; cleanup: () => void } {
  const projectRoot = join(tmpdir(), `pi-cg-sg-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  writeFileSync(
    join(projectRoot, "src/a.ts"),
    "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n",
  );
  writeFileSync(
    join(projectRoot, "src/b.ts"),
    "export function bar() {\n  return 1;\n}\n",
  );

  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
}

test("symbolGraph returns full neighborhood for a unique symbol match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Add nodes
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // foo calls bar (outgoing edge from foo)
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "calls",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "direct call", content_hash: hashA },
      created_at: Date.now(),
    });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    // Header
    expect(output).toContain("foo (function)");
    expect(output).toContain("src/a.ts:3:");

    // Callees section with bar
    expect(output).toContain("Callees");
    expect(output).toContain("bar");
    expect(output).toContain("src/b.ts:1:");
    expect(output).toContain("0.5");
    expect(output).toContain("tree-sitter");

    // No callers for foo
    expect(output).not.toContain("Callers");

    store.close();
  } finally {
    cleanup();
  }
});


test("symbolGraph returns not found message for unknown symbol", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();

    const output = symbolGraph({ name: "doesNotExist", store, projectRoot });

    expect(output).toContain("not found");
    expect(output).toContain("doesNotExist");

    store.close();
  } finally {
    cleanup();
  }
});


test("symbolGraph returns disambiguation list when multiple nodes match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Two nodes with same name "foo" in different files
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    // Should be a disambiguation list, not a neighborhood
    expect(output).toContain("Multiple matches");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
    expect(output).toContain("function");
    expect(output).toContain("class");

    // Should NOT contain section headers (not a neighborhood)
    expect(output).not.toContain("Callers");
    expect(output).not.toContain("Callees");

    store.close();
  } finally {
    cleanup();
  }
});

test("symbolGraph resolves ambiguity when file filter narrows to one match", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    // Two nodes with same name "foo" in different files
    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::foo:1", kind: "function", name: "foo", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // With file filter, should return full neighborhood (not disambiguation)
    const output = symbolGraph({ name: "foo", file: "src/a.ts", store, projectRoot });

    // Should be a neighborhood, not disambiguation
    expect(output).toContain("foo (function)");
    expect(output).toContain("src/a.ts:3:");
    expect(output).not.toContain("Multiple matches");

    store.close();
  } finally {
    cleanup();
  }
});


test("symbolGraph truncates each neighbor category independently to limit", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const hashA = sha256Hex(fileAContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });

    // Add 3 callees
    for (let i = 0; i < 3; i++) {
      const calleeId = `src/a.ts::callee${i}:${10 + i}`;
      store.addNode({ id: calleeId, kind: "function", name: `callee${i}`, file: "src/a.ts", start_line: 10 + i, end_line: 10 + i, content_hash: hashA });
      store.addEdge({
        source: "src/a.ts::foo:3",
        target: calleeId,
        kind: "calls",
        provenance: { source: "tree-sitter", confidence: 0.5 - i * 0.1, evidence: "call", content_hash: hashA },
        created_at: Date.now(),
      });
    }

    // Limit to 2 — should see 2 callees and "(1 more omitted)"
    const output = symbolGraph({ name: "foo", limit: 2, store, projectRoot });

    expect(output).toContain("Callees");
    expect(output).toContain("callee0"); // highest confidence
    expect(output).toContain("callee1");
    expect(output).toContain("(1 more omitted)");
    expect(output).not.toContain("callee2"); // truncated

    store.close();
  } finally {
    cleanup();
  }
});


test("symbolGraph excludes incoming imports edges from the Imports section", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // Incoming imports edge: foo imports bar — when we query bar, this is incoming
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "imports",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashA },
      created_at: Date.now(),
    });

    // Querying bar — the imports edge above is incoming to bar, so it should NOT appear in Imports
    const output = symbolGraph({ name: "bar", store, projectRoot });

    expect(output).not.toContain("Imports");

    store.close();
  } finally {
    cleanup();
  }
});


test("symbolGraph shows outgoing imports edges in the Imports section", () => {
  const { projectRoot, cleanup } = setupFixture();

  try {
    const store = new SqliteGraphStore();
    const { sha256Hex } = require("../src/indexer/tree-sitter.js");

    const fileAContent = "import { bar } from './b';\n\nexport function foo() {\n  bar();\n}\n";
    const fileBContent = "export function bar() {\n  return 1;\n}\n";
    const hashA = sha256Hex(fileAContent);
    const hashB = sha256Hex(fileBContent);

    store.addNode({ id: "src/a.ts::foo:3", kind: "function", name: "foo", file: "src/a.ts", start_line: 3, end_line: 5, content_hash: hashA });
    store.addNode({ id: "src/b.ts::bar:1", kind: "function", name: "bar", file: "src/b.ts", start_line: 1, end_line: 3, content_hash: hashB });

    // Outgoing imports edge: foo imports bar
    store.addEdge({
      source: "src/a.ts::foo:3",
      target: "src/b.ts::bar:1",
      kind: "imports",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "import", content_hash: hashA },
      created_at: Date.now(),
    });

    // Querying foo — this import is outgoing from foo, so it SHOULD appear in Imports
    const output = symbolGraph({ name: "foo", store, projectRoot });

    expect(output).toContain("Imports");
    expect(output).toContain("bar");

    store.close();
  } finally {
    cleanup();
  }
});