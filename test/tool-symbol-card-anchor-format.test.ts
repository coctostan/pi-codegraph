import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolGraph } from "../src/tools/symbol-graph.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { symbolContract } from "../src/tools/symbol-contract.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("symbolGraph default card renders file-separated editable anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-card-public-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(content), signature: "() => void" });

    const output = symbolGraph({ name: "foo", store, projectRoot });

    expect(output).toContain("## foo (function)");
    expect(output).toContain("src/foo.ts  1:c27");
    expect(output).not.toContain("src/foo.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("symbolCard and symbolContract render file-separated anchors", () => {
  const projectRoot = join(tmpdir(), `pi-cg-card-contract-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = "export function foo() {}\n";
  writeFileSync(join(projectRoot, "src/foo.ts"), content);

  const store = new SqliteGraphStore();
  try {
    store.addNode({ id: "src/foo.ts::foo:1", kind: "function", name: "foo", file: "src/foo.ts", start_line: 1, end_line: 1, content_hash: sha256Hex(content), signature: "() => void" });

    const card = symbolCard({ name: "foo", store, projectRoot });
    const contract = symbolContract({ name: "foo", store, projectRoot });

    expect(card).toContain("src/foo.ts  1:c27");
    expect(contract).toContain("src/foo.ts  1:c27");
    expect(card).not.toContain("src/foo.ts:1:");
    expect(contract).not.toContain("src/foo.ts:1:");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
