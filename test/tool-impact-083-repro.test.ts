import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { collectImpact, impact } from "../src/tools/impact.js";

function setup() {
  const projectRoot = join(tmpdir(), `pi-cg-impact-083-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  // Entry-point function with no callers
  writeFileSync(join(projectRoot, "src", "entry.ts"), "export function entryPoint() { return 1; }\n");
  // Interface + implementer + caller
  writeFileSync(
    join(projectRoot, "src", "iface.ts"),
    "export interface Store { get(): number }\nexport class MyStore implements Store { get() { return 1 } }\nexport function useStore(s: Store) { return s.get() }\n",
  );
  const store = new SqliteGraphStore();
  store.addNode({ id: "src/entry.ts::entryPoint:1", kind: "function", name: "entryPoint", file: "src/entry.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
  store.addNode({ id: "src/iface.ts::Store:1", kind: "interface", name: "Store", file: "src/iface.ts", start_line: 1, end_line: 1, content_hash: "h", is_exported: true });
  store.addNode({ id: "src/iface.ts::MyStore:2", kind: "class", name: "MyStore", file: "src/iface.ts", start_line: 2, end_line: 2, content_hash: "h", is_exported: true });
  store.addNode({ id: "src/iface.ts::useStore:3", kind: "function", name: "useStore", file: "src/iface.ts", start_line: 3, end_line: 3, content_hash: "h", is_exported: true });

  // MyStore implements Store
  store.addEdge({
    source: "src/iface.ts::MyStore:2",
    target: "src/iface.ts::Store:1",
    kind: "implements",
    provenance: { source: "lsp", confidence: 0.9, evidence: "implements", content_hash: "h" },
    created_at: 1,
  });
  // useStore calls MyStore.get — model as calls MyStore
  store.addEdge({
    source: "src/iface.ts::useStore:3",
    target: "src/iface.ts::MyStore:2",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.8, evidence: "call", content_hash: "h" },
    created_at: 1,
  });
  return { projectRoot, store };
}

test("BUG #073: impact on an entry-point symbol returns the entry-point diagnostic", () => {
  const { projectRoot, store } = setup();
  try {
    const out = impact({
      symbols: ["entryPoint"],
      changeType: "signature_change",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("Trust: stale");
    expect(out).toContain("No dependents found — 'entryPoint' is an entry point with no callers.");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("BUG #073 + #074: impact on an interface with implementors returns the implementor chain (not the interface diagnostic)", () => {
  const { projectRoot, store } = setup();
  try {
    const out = impact({
      symbols: ["Store"],
      changeType: "removal",
      store,
      projectRoot,
      maxDepth: 5,
    });
    expect(out).toContain("Trust: stale");
    // With #074 fixed, Store → MyStore (implements) → useStore (calls) chain is found;
    // therefore the interface *diagnostic* must NOT fire.
    expect(out).not.toContain("No call-edge dependents found for interface");
    expect(out).toContain("MyStore");
    expect(out).toContain("useStore");
    expect(out).toContain("breaking");
    expect(out).toContain("behavioral");
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("BUG #074: impact on an interface traverses implements edges via collectImpact", () => {
  const { projectRoot, store } = setup();
  try {
    const hits = collectImpact({
      symbols: ["Store"],
      changeType: "signature_change",
      store,
      maxDepth: 5,
    });
    expect(hits).toEqual([
      { nodeId: "src/iface.ts::MyStore:2", name: "MyStore", file: "src/iface.ts", depth: 1, classification: "breaking" },
      { nodeId: "src/iface.ts::useStore:3", name: "useStore", file: "src/iface.ts", depth: 2, classification: "behavioral" },
    ]);
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
