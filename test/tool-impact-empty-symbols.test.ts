import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { collectImpact, impact } from "../src/tools/impact.js";

function setupProjectWithGraph() {
  const projectRoot = join(tmpdir(), `pi-cg-impact-empty-symbols-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 1; }\n");
  const store = new SqliteGraphStore();
  store.addNode({
    id: "src/shared.ts::shared:1",
    kind: "function",
    name: "shared",
    file: "src/shared.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
    is_exported: true,
  });
  return { projectRoot, store };
}

test("impact() returns Trust-header-wrapped error with example when symbols is empty array", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: [],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
    expect(out).toContain("impact({");
    expect(out).toContain("changeType");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() returns Trust-header-wrapped error when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: undefined as unknown as string[],
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["shared"],
      changeType: "typo_change" as unknown as "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("changeType");
    expect(out).toContain("signature_change");
    expect(out).toContain("removal");
    expect(out).toContain("behavior_change");
    expect(out).toContain("addition");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});


test("collectImpact() returns [] (not a throw) when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = collectImpact({
      symbols: undefined as unknown as string[],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });
    expect(out).toEqual([]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("collectImpact() returns [] when symbols is empty array", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = collectImpact({
      symbols: [],
      changeType: "behavior_change",
      store,
      maxDepth: 5,
    });
    expect(out).toEqual([]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("collectImpact() throws a clean error listing valid literals when changeType is invalid", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    store.addNode({
      id: "src/caller.ts::caller:1",
      kind: "function",
      name: "caller",
      file: "src/caller.ts",
      start_line: 1,
      end_line: 1,
      content_hash: "h",
    });
    store.addEdge({
      source: "src/caller.ts::caller:1",
      target: "src/shared.ts::shared:1",
      kind: "calls",
      provenance: {
        source: "tree-sitter",
        confidence: 0.5,
        evidence: "call",
        content_hash: "hash",
      },
      created_at: 1,
    });

    expect(() =>
      collectImpact({
        symbols: ["shared"],
        changeType: "typo_change" as unknown as "behavior_change",
        store,
        maxDepth: 5,
      }),
    ).toThrow("changeType");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
