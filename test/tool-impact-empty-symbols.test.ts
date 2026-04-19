import { expect, test } from "bun:test";
// Regression test for issue #065: impact must diagnose empty/undefined symbols[]
// instead of crashing (undefined) or returning a silent empty Trust header ([]).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { collectImpactDetails, impact } from "../src/tools/impact.js";

function setupProjectWithGraph() {
  const projectRoot = join(tmpdir(), `pi-cg-impact-empty-symbols-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

test("impact() returns error message when symbols is empty array", () => {
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
    expect(out).toContain("Error");
    expect(out).toContain("symbols");
    expect(out).toContain("required");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("impact() returns error message when symbols is undefined", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: undefined as any,
      changeType: "behavior_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("Error");
    expect(out).toContain("symbols");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});


test("impact() returns error message for invalid changeType", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    const out = impact({
      symbols: ["shared"],
      changeType: "invalid_type" as any,
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("## Trust");
    expect(out).toContain("Error");
    expect(out).toContain("changeType");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});


test("collectImpactDetails() returns [] without entering BFS when symbols is empty", () => {
  const { projectRoot, store } = setupProjectWithGraph();
  try {
    let getNeighborsCalls = 0;
    const spiedStore = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop === "getNeighbors") {
          return (...args: unknown[]) => {
            getNeighborsCalls++;
            return (target as any).getNeighbors(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const result = collectImpactDetails({
      symbols: [],
      changeType: "behavior_change",
      store: spiedStore as any,
      maxDepth: 5,
    });
    expect(result).toEqual([]);
    // BFS must not traverse on empty input — store.getNeighbors is the
    // per-step BFS traversal call at src/tools/impact.ts:89, so 0 calls
    // proves the BFS loop never entered.
    expect(getNeighborsCalls).toBe(0);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
