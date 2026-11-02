import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

const noopClient: ITsServerClient = {
  async definition() { return null; },
  async references() { return []; },
  async implementations() { return []; },
  async shutdown() {},
};

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function write(root: string, rel: string, content = "export const x = 1;\n") {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-git-files-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@test.com");
  git(root, "config", "user.name", "Test");
  return root;
}

test("indexProject in a repo indexes the files git lists, leaving ignored ones and the walk's skipped dirs out", async () => {
  const root = tempRepo();
  write(root, ".gitignore", "dist/\n");
  write(root, "src/a.ts");
  write(root, "src/gone.ts");
  write(root, ".megapowers/plans/repro.test.ts");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "c1");
  write(root, "src/untracked.tsx");
  write(root, "dist/built.ts");
  // The walk skips symlinks (Dirent.isFile); git lists them, so the git path must too.
  symlinkSync(join(root, "src", "a.ts"), join(root, "src", "link.ts"));
  rmSync(join(root, "src", "gone.ts"));

  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect(store.listFiles().filter((f) => !f.startsWith("__")).sort()).toEqual(["src/a.ts", "src/untracked.tsx"]);
    expect(result.indexed).toBe(2);
    expect(result.errors).toBe(0);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject indexes a file with a merge conflict once, though git lists it per stage", async () => {
  const root = tempRepo();
  write(root, "src/a.ts", "export const a = 0;\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base");
  git(root, "checkout", "-q", "-b", "side");
  write(root, "src/a.ts", "export const a = 1;\n");
  git(root, "commit", "-q", "-am", "side");
  git(root, "checkout", "-q", "-");
  write(root, "src/a.ts", "export const a = 2;\n");
  git(root, "commit", "-q", "-am", "main");
  expect(() => git(root, "merge", "-q", "side")).toThrow();

  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect([result.indexed, result.skipped]).toEqual([1, 0]);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject removes a file from the index once git ignores it", async () => {
  const root = tempRepo();
  write(root, "src/a.ts");
  write(root, "gen/out.ts");
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect(store.listFiles()).toContain("gen/out.ts");

    write(root, ".gitignore", "gen/\n");
    const second = await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect(store.listFiles()).not.toContain("gen/out.ts");
    expect(second.removed).toBe(1);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("indexProject rooted in a repo's subdirectory indexes only that subtree, paths relative to the root", async () => {
  const repo = tempRepo();
  write(repo, "other.ts");
  write(repo, "pkg/src/a.ts");
  const store = new SqliteGraphStore();
  try {
    await indexProject(join(repo, "pkg"), store, { lspClientFactory: () => noopClient });
    expect(store.listFiles().filter((f) => !f.startsWith("__"))).toEqual(["src/a.ts"]);
  } finally {
    store.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("indexProject rooted in a directory its repo ignores falls back to the walk", async () => {
  const repo = tempRepo();
  write(repo, ".gitignore", "/*\n");
  write(repo, "project/src/a.ts");
  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(join(repo, "project"), store, { lspClientFactory: () => noopClient });
    expect(store.listFiles().filter((f) => !f.startsWith("__"))).toEqual(["src/a.ts"]);
    expect(result.indexed).toBe(1);
  } finally {
    store.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("indexProject rooted in a subdirectory whose only files are ignored indexes none of them", async () => {
  const repo = tempRepo();
  write(repo, ".gitignore", "pkg/generated/\n");
  write(repo, "pkg/generated/out.ts");
  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(join(repo, "pkg"), store, { lspClientFactory: () => noopClient });
    expect(store.listFiles().filter((f) => !f.startsWith("__"))).toEqual([]);
    expect(result.indexed).toBe(0);
  } finally {
    store.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test("indexProject outside a repo walks the directory, skipping node_modules", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-no-git-"));
  write(root, "src/a.ts");
  write(root, "dist/built.ts");
  write(root, "node_modules/pkg/index.ts");
  const store = new SqliteGraphStore();
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => noopClient });
    expect(store.listFiles().filter((f) => !f.startsWith("__")).sort()).toEqual(["dist/built.ts", "src/a.ts"]);
    expect(result.indexed).toBe(2);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
