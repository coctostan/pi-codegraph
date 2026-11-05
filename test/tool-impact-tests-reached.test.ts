import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { impactResult } from "../src/tools/impact.js";

function node(id: string, kind: GraphNode["kind"], name: string, file: string, line: number): GraphNode {
  return { id, kind, name, file, start_line: line, end_line: line, content_hash: "h", is_exported: false };
}

function call(store: SqliteGraphStore, source: string, target: string) {
  store.addEdge({
    source,
    target,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.6, evidence: "call", content_hash: "h" },
    created_at: 1,
  });
}

function withGraph(run: (store: SqliteGraphStore, projectRoot: string) => void) {
  const projectRoot = mkdtempSync(join(tmpdir(), "pi-cg-impact-tests-"));
  mkdirSync(join(projectRoot, "src"));
  mkdirSync(join(projectRoot, "test"));
  for (const file of ["src/shared.ts", "src/a.ts", "src/b.ts", "src/c.ts", "test/shared.test.ts", "test/helper.spec.ts", "test/inline.ts"]) {
    writeFileSync(join(projectRoot, file), "line one\nline two\nline three\n");
  }
  const store = new SqliteGraphStore();
  try {
    store.addNode(node("shared", "function", "shared", "src/shared.ts", 1));
    store.addNode(node("bCaller", "function", "bCaller", "src/b.ts", 1));
    // Line order and name order disagree, so the line breaks the tie.
    store.addNode(node("alpha", "function", "alpha", "src/a.ts", 3));
    store.addNode(node("beta", "function", "beta", "src/a.ts", 2));
    store.addNode(node("far", "function", "far", "src/a.ts", 1));
    store.addNode(node("leafUtil", "function", "leafUtil", "src/c.ts", 1));
    store.addNode(node("inner", "function", "inner", "src/c.ts", 2));
    store.addNode(node("case1", "test", "test/shared.test.ts > shared works", "test/shared.test.ts", 1));
    store.addNode(node("case2", "test", "test/shared.test.ts > bCaller works", "test/shared.test.ts", 2));
    store.addNode(node("helper", "function", "setup", "test/helper.spec.ts", 1));
    store.addNode(node("helperCase", "test", "test/helper.spec.ts > setup works", "test/helper.spec.ts", 2));
    // A test case outside a `*.test.ts` file still joins the list.
    store.addNode(node("case3", "test", "test/inline.ts > inline works", "test/inline.ts", 1));
    call(store, "bCaller", "shared");
    call(store, "alpha", "shared");
    call(store, "beta", "shared");
    call(store, "far", "bCaller");
    call(store, "bCaller", "inner");
    call(store, "case1", "shared");
    call(store, "case1", "leafUtil");
    call(store, "case2", "bCaller");
    call(store, "helper", "shared");
    call(store, "helperCase", "shared");
    call(store, "case3", "shared");
    run(store, projectRoot);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("impact rows carry class and depth only, by depth then file then line", () => {
  withGraph((store, projectRoot) => {
    const out = impactResult({ symbols: ["shared"], changeType: "signature_change", store, projectRoot }).text;
    const rows = out.split("\n").filter((line) => line.startsWith("src/"));
    expect(rows).toEqual([
      expect.stringMatching(/^src\/a\.ts  2:[0-9a-f]{3}  beta  breaking  depth:1( \[stale\])?$/),
      expect.stringMatching(/^src\/a\.ts  3:[0-9a-f]{3}  alpha  breaking  depth:1( \[stale\])?$/),
      expect.stringMatching(/^src\/b\.ts  1:[0-9a-f]{3}  bCaller  breaking  depth:1( \[stale\])?$/),
      expect.stringMatching(/^src\/a\.ts  1:[0-9a-f]{3}  far  behavioral  depth:2( \[stale\])?$/),
    ]);
    expect(out).not.toContain("fan-in");
    expect(out).not.toContain("chain-confidence");
  });
});

test("impact lists the tests calling a changed symbol directly, then those reached through other callers, by file", () => {
  withGraph((store, projectRoot) => {
    const out = impactResult({ symbols: ["shared"], changeType: "behavior_change", store, projectRoot }).text;
    // The body, past the stale Trust header that names every affected symbol.
    const body = out.slice(out.indexOf("\nsrc/") + 1);
    expect(body).toMatch(
      /far  behavioral  depth:2( \[stale\])?\n\nTests reached directly \(3 cases in 3 files\):\ntest\/helper\.spec\.ts\ntest\/inline\.ts\ntest\/shared\.test\.ts\n\nTests reached through other callers \(1 case in 1 file\):\ntest\/shared\.test\.ts\n$/,
    );
    expect(body).not.toContain("works");
    expect(body).not.toContain("setup");
  });
});

test("impact's test list counts one case and one file in the singular", () => {
  withGraph((store, projectRoot) => {
    const out = impactResult({ symbols: ["bCaller"], changeType: "behavior_change", store, projectRoot, maxDepth: 1 }).text;
    expect(out).toContain("src/a.ts  1:");
    expect(out).toContain("Tests reached directly (1 case in 1 file):\ntest/shared.test.ts\n");
    expect(out).not.toContain("through other callers");
  });
});

test("impact with only direct tests prints the list without a leading blank line", () => {
  withGraph((store, projectRoot) => {
    const out = impactResult({ symbols: ["leafUtil"], changeType: "behavior_change", store, projectRoot }).text;
    expect(out).toContain("\nTests reached directly (1 case in 1 file):\ntest/shared.test.ts\n");
    expect(out).not.toContain("\n\nTests reached");
    expect(out).not.toContain("through other callers");
  });
});

test("impact with no direct test prints only the list reached through other callers", () => {
  withGraph((store, projectRoot) => {
    const out = impactResult({ symbols: ["inner"], changeType: "behavior_change", store, projectRoot }).text;
    expect(out).toContain("bCaller  behavioral  depth:1");
    expect(out).toContain("\n\nTests reached through other callers (1 case in 1 file):\ntest/shared.test.ts\n");
    expect(out).not.toContain("Tests reached directly");
  });
});
