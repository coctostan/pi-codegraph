import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const fakeClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

test("pipeline Stage 3 indexes same-file renders edges from TSX fixture", async () => {
  const root = join(tmpdir(), `pi-cg-react-stage3-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });
  writeFileSync(join(root, "src", "App.tsx"), `export function Button() { return <button/>; }
export function App() {
  return <Button />;
}
`);
  writeFileSync(join(root, "src", "components", "Button.tsx"), `export function Button() {
  return <button>external</button>;
}
`);
  const store = new SqliteGraphStore();
  try {
    const sgCheck = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck.exited) !== 0) {
      console.warn("Skipping React Stage 3 integration: sg not available");
      return;
    }
    await indexProject(root, store, { lspClientFactory: () => fakeClient });

    const app = store.findNodes("App", "src/App.tsx")[0]!;
    const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
    expect(renders).toHaveLength(1);
    expect(renders[0]!.node.name).toBe("Button");
    expect(renders[0]!.node.file).toBe("src/App.tsx");
    expect(renders.some((r) => r.node.file === "src/components/Button.tsx")).toBeFalse();
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("same-file-only lookup excludes cross-file target when local target is absent", async () => {
  const root = join(tmpdir(), `pi-cg-react-stage3-miss-${Date.now()}`);
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "src", "components"), { recursive: true });

  writeFileSync(join(root, "src", "App.tsx"), `export function App() { return <Button />; }\n`);
  writeFileSync(join(root, "src", "components", "Button.tsx"), `export function Button() { return <button/>; }\n`);

  const store = new SqliteGraphStore();
  try {
    const sgCheck2 = Bun.spawn(["sg", "--version"], { stdout: "pipe", stderr: "pipe" });
    if ((await sgCheck2.exited) !== 0) {
      console.warn("Skipping React Stage 3 integration: sg not available");
      return;
    }
    await indexProject(root, store, { lspClientFactory: () => fakeClient });
    const app = store.findNodes("App", "src/App.tsx")[0]!;
    const renders = store.getNeighbors(app.id, { direction: "out", kind: "renders" });
    expect(renders).toHaveLength(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
