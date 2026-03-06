import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

test("indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes", async () => {
  const root = join(tmpdir(), `pi-codegraph-index-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });

  const aContent = [
    'import { x } from "./b";',
    "export function a() {",
    "  x();",
    "}",
  ].join("\n");

  const bContent = ["export function x() {}"].join("\n");
  const ignoredContent = "export function ignored() {}";

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(join(root, "node_modules", "pkg", "ignored.ts"), ignoredContent);

  const store = new SqliteGraphStore(dbPath);
  try {
    const result = await indexProject(root, store);

    expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file, hash FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string; hash: string }>;

      expect(fileRows).toEqual([
        { file: "src/a.ts", hash: sha256Hex(aContent) },
        { file: "src/b.ts", hash: sha256Hex(bContent) },
      ]);

      const edgeKinds = db
        .query("SELECT kind FROM edges ORDER BY kind ASC")
        .all() as Array<{ kind: string }>;
      expect(edgeKinds.map((r) => r.kind)).toEqual(["calls", "imports"]);
    } finally {
      db.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject deletes missing files and continues when a file cannot be read", async () => {
  const root = join(tmpdir(), `pi-codegraph-removed-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });

  const aContent = "export function a() {}";
  const bContent = "export function b() {}";
  const unreadablePath = join(root, "src", "unreadable.ts");

  writeFileSync(join(root, "src", "a.ts"), aContent);
  writeFileSync(join(root, "src", "b.ts"), bContent);
  writeFileSync(unreadablePath, "export function nope() {}");

  // Make unreadable to force readFileSync failure
  chmodSync(unreadablePath, 0o000);

  const store = new SqliteGraphStore(dbPath);
  try {
    await expect(indexProject(root, store)).resolves.toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });

    // Remove a previously indexed file
    rmSync(join(root, "src", "b.ts"), { force: true });

    await expect(indexProject(root, store)).resolves.toEqual({ indexed: 0, skipped: 1, removed: 1, errors: 1 });

    const db = new Database(dbPath);
    try {
      const fileRows = db
        .query("SELECT file FROM file_hashes ORDER BY file ASC")
        .all() as Array<{ file: string }>;

      // b.ts removed; unreadable.ts never indexed successfully
      expect(fileRows.map((r) => r.file)).toEqual(["src/a.ts"]);
    } finally {
      db.close();
    }
  } finally {
    // Restore permissions so cleanup works reliably
    try {
      chmodSync(unreadablePath, 0o644);
    } catch {
      // ignore
    }

    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject re-indexes a changed file: removes old nodes and stores new ones (criterion 23)", async () => {
  const root = join(tmpdir(), `pi-codegraph-changed-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");

  mkdirSync(join(root, "src"), { recursive: true });

  const originalContent = "export function original() {}";
  const changedContent = "export function changed() {}";

  writeFileSync(join(root, "src", "a.ts"), originalContent);

  const store = new SqliteGraphStore(dbPath);
  try {
    // First run: index original content.
    await expect(indexProject(root, store)).resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });

    const db1 = new Database(dbPath);
    try {
      const names1 = (db1.query("SELECT name FROM nodes WHERE kind = 'function'").all() as Array<{ name: string }>).map((r) => r.name);
      expect(names1).toContain("original");
      expect(names1).not.toContain("changed");
    } finally {
      db1.close();
    }

    // Change the file.
    writeFileSync(join(root, "src", "a.ts"), changedContent);

    // Second run: should re-index the changed file.
    await expect(indexProject(root, store)).resolves.toEqual({ indexed: 1, skipped: 0, removed: 0, errors: 0 });

    const db2 = new Database(dbPath);
    try {
      const names2 = (db2.query("SELECT name FROM nodes WHERE kind = 'function'").all() as Array<{ name: string }>).map((r) => r.name);
      expect(names2).not.toContain("original");
      expect(names2).toContain("changed");

      // Hash must be updated to reflect new content.
      const row = db2.query("SELECT hash FROM file_hashes WHERE file = 'src/a.ts'").get() as { hash: string };
      expect(row.hash).toBe(createHash("sha256").update(changedContent).digest("hex"));
    } finally {
      db2.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});


test("indexProject runs LSP stage and upgrades unresolved call edge to lsp provenance", async () => {
  const root = join(tmpdir(), `pi-codegraph-lsp-stage-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "api.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(root, "src", "impl.ts"), 'import { shared } from "./api";\nexport function run(){ shared(); }\n');
  const store = new SqliteGraphStore(dbPath);
  try {
    const fakeClient: ITsServerClient = {
      async definition(file, line, col) {
        if (file === "src/impl.ts" && line === 2 && col === 24) {
          return { file: "src/api.ts", line: 1, col: 17 };
        }
        return null;
      },
      async references() {
        return [];
      },
      async implementations() {
        return [];
      },
      async shutdown() {},
    };

    const result = await indexProject(root, store, {
      lspClientFactory: () => fakeClient,
    });

    expect(result.errors).toBe(0);

    const runNode = store.findNodes("run", "src/impl.ts")[0]!;
    const out = store.getEdgesBySource(runNode.id);
    expect(out.some((e) => e.kind === "calls" && e.provenance.source === "lsp")).toBe(true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
