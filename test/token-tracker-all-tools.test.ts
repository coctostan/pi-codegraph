import { expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { resetSession, appendTokenMeta } from "../src/tools/token-tracker.js";
import { impact } from "../src/tools/impact.js";
import { graphOverview } from "../src/tools/graph-overview.js";
import { deadCode } from "../src/tools/dead-code.js";

beforeEach(() => { resetSession(); });

function makeTestEnv() {
  const projectRoot = join(tmpdir(), `pi-cg-meta-all-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const fileA = "export function foo() { return 1; }\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileA);
  const store = new SqliteGraphStore();
  const hashA = sha256Hex(fileA);
  store.setFileHash("src/a.ts", hashA);
  store.addNode({ id: "src/a.ts::foo:1", kind: "function", name: "foo", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: hashA, is_exported: true });
  return { projectRoot, store, cleanup: () => { store.close(); rmSync(projectRoot, { recursive: true, force: true }); } };
}

test("appendTokenMeta works with impact", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const text = impact({ symbols: ["foo"], changeType: "behavior_change", store, projectRoot });
    const output = appendTokenMeta("impact", { symbols: ["foo"] }, text, store, projectRoot);
    expect(output).toContain("_meta:");
    expect(output).toContain("session_calls:1");
  } finally { cleanup(); }
});

test("session accumulates across multiple tool calls", () => {
  const { projectRoot, store, cleanup } = makeTestEnv();
  try {
    const t1 = graphOverview({ store, projectRoot });
    const o1 = appendTokenMeta("graph_overview", {}, t1, store, projectRoot);
    expect(o1).toContain("session_calls:1");
    const t2 = deadCode({ store, projectRoot });
    const o2 = appendTokenMeta("dead_code", {}, t2, store, projectRoot);
    expect(o2).toContain("session_calls:2");
  } finally { cleanup(); }
});
