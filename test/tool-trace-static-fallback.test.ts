import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { trace } from "../src/tools/trace.js";

test("trace falls back to a deterministic static call path when no coverage trace exists", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-static-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function entry() { return first(); }\nexport function first() { return second(); }\nexport function second() { return 1; }\n",
  );

  const store = new SqliteGraphStore();
  try {
    const entry = { id: "src/app.ts::entry:1", kind: "function" as const, name: "entry", file: "src/app.ts", start_line: 1, end_line: 1, content_hash: "h-app" };
    const first = { id: "src/app.ts::first:2", kind: "function" as const, name: "first", file: "src/app.ts", start_line: 2, end_line: 2, content_hash: "h-app" };
    const second = { id: "src/app.ts::second:3", kind: "function" as const, name: "second", file: "src/app.ts", start_line: 3, end_line: 3, content_hash: "h-app" };

    store.addNode(entry);
    store.addNode(first);
    store.addNode(second);
    store.addEdge({ source: entry.id, target: first.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first", content_hash: "h-app" }, created_at: 1 });
    store.addEdge({ source: first.id, target: second.id, kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second", content_hash: "h-app" }, created_at: 2 });

    const output = trace({ entry: "entry", file: "src/app.ts", store, projectRoot });
    expect(output).toContain("mode: static");
    expect(output).toMatch(/src\/app\.ts  1:[0-9a-f]{3}  entry  function/);
    expect(output).toMatch(/src\/app\.ts  2:[0-9a-f]{3}  first  function/);
    expect(output).toMatch(/src\/app\.ts  3:[0-9a-f]{3}  second  function/);
    expect(output).not.toMatch(/src\/app\.ts:1:[0-9a-f]{4}/);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("trace file-scoped miss candidates render file-separated editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-trace-miss-anchor-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({
      id: "src/a.ts::foo:1",
      kind: "function",
      name: "foo",
      file: "src/a.ts",
      start_line: 1,
      end_line: 1,
      content_hash: createHash("sha256").update(content).digest("hex"),
    });

    const output = trace({ entry: "foo", file: "src/missing.ts", store, projectRoot });

    expect(output).toContain('Symbol "foo" was not found in src/missing.ts');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).not.toContain("src/a.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});