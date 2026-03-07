import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

test("ITsServerClient contract used by indexProject is explicit", () => {
  const fakeClient: ITsServerClient = {
    async definition() { return null; },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };
  expect(typeof fakeClient.definition).toBe("function");
  expect(typeof fakeClient.references).toBe("function");
  expect(typeof fakeClient.implementations).toBe("function");
  expect(typeof fakeClient.shutdown).toBe("function");
});

test("indexProject indexes TSX function components", async () => {
  const root = join(tmpdir(), `pi-codegraph-tsx-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "App.tsx"),
    "export function App() {\n  return <button>Hello</button>;\n}\n",
  );
  writeFileSync(join(root, "src", "util.ts"), "export function util() { return 1; }\n");

  const store = new SqliteGraphStore();
  const fakeClient: ITsServerClient = {
    async definition() { return null; },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  try {
    const result = await indexProject(root, store, { lspClientFactory: () => fakeClient });
    expect(result.indexed).toBe(2); // proves walkTsFiles includes both .ts and .tsx
    expect(store.findNodes("App", "src/App.tsx")).toHaveLength(1);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
