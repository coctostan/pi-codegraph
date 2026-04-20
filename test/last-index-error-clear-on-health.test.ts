import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
function createTestProject(): string {
  const root = join(tmpdir(), `pi-cg-sticky-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return root;
}
function populateStore(projectRoot: string): void {
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const store = new SqliteGraphStore(join(dbDir, "graph.db"));
  const content = "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n";
  const extracted = extractFile("src/hello.ts", content);
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);
  store.setFileHash("src/hello.ts", sha256Hex(content));
  store.close();
}
describe("RC-D: lastIndexError clears on store-health evidence", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  test("finalizeReadOnlyOutput clears transient lastIndexError but preserves 'readonly database'", async () => {
    const root = createTestProject();
    dirs.push(root);
    populateStore(root);
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    const prevDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (prevDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = prevDev;
    }

    // Patch listFiles to throw a configurable message on every call. The
    // throw propagates up through `indexProject` into `ensureIndexed`'s
    // catch at `src/index.ts:109-112`, which sets
    // `lastIndexError = new Error(pendingMessage)`. This reliably primes
    // the flag at the top of each tool call, regardless of the pre-populated
    // store's hash-match skip path.
    const origListFiles = SqliteGraphStore.prototype.listFiles;
    let pendingMessage: string | null = null;
    SqliteGraphStore.prototype.listFiles = function () {
      if (pendingMessage) throw new Error(pendingMessage);
      return origListFiles.call(this);
    };

    try {
      const ctx = { cwd: root };
      // --- Phase 1: transient non-readonly error ---
      // The hook must clear lastIndexError AFTER the note is rendered.
      pendingMessage = "transient scan failure";
      const r1 = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      const t1: string = r1.content[0]?.text ?? "";
      // THIS call's output still carries the accurate message (Task 1's
      // contract): the clear hook runs AFTER the note is built.
      expect(t1).toContain("alpha");
      expect(t1).toContain("indexing-failed");
      expect(t1).toContain("transient scan failure");
      // Post-prefix hook must have wiped the flag by the time the call returns.
      expect(mod.getLastIndexErrorForTesting()).toBeNull();
      // --- Phase 2: verified-readonly literal ---
      // The hook must NOT clear when the message is exactly "readonly database".
      pendingMessage = "readonly database";
      const r2 = await sgExecute!("c2", { name: "alpha" }, undefined, undefined, ctx);
      const t2: string = r2.content[0]?.text ?? "";
      expect(t2).toContain("alpha");
      expect(t2).toContain("indexing-failed");
      expect(t2).toContain("readonly database");
      // Flag survives — the "readonly database" literal is verified-persistent.
      expect(mod.getLastIndexErrorForTesting()?.message).toBe("readonly database");
      // --- Phase 3: sanity check via the test setter ---
      // Confirm the new setter is callable and can reset state.
      mod.setLastIndexErrorForTesting(null);
      expect(mod.getLastIndexErrorForTesting()).toBeNull();
    } finally {
      SqliteGraphStore.prototype.listFiles = origListFiles;
      mod.setLastIndexErrorForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
