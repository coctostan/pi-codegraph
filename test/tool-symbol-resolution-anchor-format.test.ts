import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { formatAmbiguousMatches } from "../src/tools/symbol-resolution.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("formatAmbiguousMatches renders candidate files separately from editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-res-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() {}\n";
  const bContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  try {
    const output = formatAmbiguousMatches("foo", [
      { id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) },
      { id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) },
    ], projectRoot);

    expect(output).toContain('Multiple matches for "foo"');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
    expect(output).not.toContain("src/a.ts:1:");
    expect(output).not.toContain("src/b.ts:1:");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolGraph neighborhood ambiguity uses file-separated candidate anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-amb-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const aContent = "export function foo() {}\n";
  const bContent = "export class foo {}\n";
  writeFileSync(join(projectRoot, "src/a.ts"), aContent);
  writeFileSync(join(projectRoot, "src/b.ts"), bContent);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(aContent) });
    store.addNode({ id: "src/b.ts::foo:1", kind: "class", name: "foo", file: "src/b.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(bContent) });

    const output = symbolGraph({ name: "foo", include: ["neighborhood"], store, projectRoot });

    expect(output).toContain('Multiple matches for "foo"');
    expect(output).toContain("src/a.ts  1:c27  foo (function)");
    expect(output).toMatch(/src\/b\.ts  1:[0-9a-f]{3}  foo \(class\)/);
    expect(output).not.toContain("src/a.ts:1:");
    expect(output).not.toContain("src/b.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
