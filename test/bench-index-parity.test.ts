import { expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffGraphs, EDITS, main, report, snapshotGraph, type Edit } from "../bench/index-parity.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphEdge } from "../src/graph/types.js";

const node = { id: "a.ts::f:1", kind: "function" as const, name: "f", file: "a.ts", start_line: 1, end_line: 2, content_hash: "h" };
const edge = (target: string, created_at: number): GraphEdge => ({
  source: node.id,
  target,
  kind: "calls",
  provenance: { source: "tree-sitter", confidence: 0.5, evidence: "e", content_hash: "h" },
  created_at,
});

test("diffGraphs sets created_at aside and names the rows only one side holds", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-parity-diff-"));
  try {
    const paths = [join(dir, "incremental.db"), join(dir, "fresh.db")];
    const [incremental, fresh] = paths.map((p) => new SqliteGraphStore(p));
    for (const store of [incremental!, fresh!]) store.addNode(node);
    incremental!.addEdge(edge("b.ts::g:1", 1));
    fresh!.addEdge(edge("b.ts::g:1", 2));
    incremental!.addEdge(edge("b.ts::gone:1", 1));
    fresh!.saveTestTrace({ testNodeId: node.id, steps: [{ nodeId: node.id, ordinal: 0, contentHash: "h" }] });
    for (const store of [incremental!, fresh!]) store.close();

    const diffs = diffGraphs(snapshotGraph(paths[0]!), snapshotGraph(paths[1]!));
    expect(diffs.map((d) => [d.table, d.onlyIncremental.length, d.onlyFresh.length])).toEqual([
      ["edges", 1, 0],
      ["test_trace_steps", 0, 1],
    ]);
    expect(diffs[0]!.onlyIncremental[0]).toContain("b.ts::gone:1");
    expect(diffs[0]!.onlyIncremental[0]).not.toContain("created_at");
    expect(diffGraphs(snapshotGraph(paths[0]!), snapshotGraph(paths[0]!))).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("report prints PASS or FAIL per edit with the first differing rows and exits 0 only when all pass", () => {
  const rows = Array.from({ length: 7 }, (_, i) => `{"id":"r${i}"}`);
  const failing = { name: "callee rename", diffs: [{ table: "edges" as const, onlyIncremental: rows, onlyFresh: ["{\"id\":\"f\"}"] }] };
  expect(report([{ name: "control", diffs: [] }])).toEqual({ lines: ["PASS control", "1/1 edits pass"], code: 0 });
  const { lines, code } = report([{ name: "control", diffs: [] }, failing]);
  expect(code).toBe(1);
  expect(lines).toEqual([
    "PASS control",
    "FAIL callee rename: edges 7 only incremental, 1 only fresh",
    ...rows.slice(0, 5).map((r) => `  - edges ${r}`),
    "  - edges … 2 more",
    `  + edges {"id":"f"}`,
    "1/2 edits pass",
  ]);
});

test("each scripted edit applies to this repo's src/ and refuses a tree without its target", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-parity-edits-"));
  const refused = (root: string) =>
    EDITS.filter((e) => {
      try {
        e.apply(root);
        return false;
      } catch {
        return true;
      }
    }).map((e) => e.name);
  try {
    expect(EDITS.map((e) => e.name)).toEqual(["control", "comment append", "line shift", "callee rename", "file removal", "file addition"]);
    expect(refused(dir)).toEqual(EDITS.slice(1).map((e) => e.name));
    cpSync(join(import.meta.dir, "..", "src"), join(dir, "src"), { recursive: true });
    expect(refused(dir)).toEqual([]);
    // A rename whose target is already gone changes nothing, and says so.
    expect(() => EDITS[3]!.apply(dir)).toThrow("nothing to change");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A git repo of `files` in one commit; `run` gets its path and that commit, and the repo is removed afterwards. */
async function withRepo(files: Record<string, string>, run: (repo: string, commit: string, git: (...args: string[]) => string) => Promise<void>) {
  const repo = mkdtempSync(join(tmpdir(), "cg-parity-repo-"));
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };
  try {
    git("init", "-q");
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(join(repo, file, ".."), { recursive: true });
      writeFileSync(join(repo, file), text);
    }
    git("add", ".");
    git("commit", "-qm", "one");
    await run(repo, git("rev-parse", "HEAD"), git);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

/** `main`'s exit code with what it printed to stdout and stderr. */
async function capture(run: () => Promise<number>) {
  const out: string[] = [];
  const err: string[] = [];
  const spies = [spyOn(console, "log").mockImplementation((l) => void out.push(String(l))), spyOn(console, "error").mockImplementation((l) => void err.push(String(l)))];
  try {
    return { code: await run(), out, err };
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

const CALLING = {
  "src/a.ts": "export function alpha() {\n  return beta();\n}\nexport function beta() {\n  return 1;\n}\n",
  "src/b.ts": 'import { alpha } from "./a";\nexport function gamma() {\n  return alpha();\n}\n',
};

test("main fails a tree edited differently on each side, then resets both to pass an unedited one, leaving no worktree behind", async () => {
  await withRepo(CALLING, async (repo, commit, git) => {
    let applied = 0;
    const edits: Edit[] = [
      // Writes a different function on each side, so the two trees differ by construction.
      { name: "perturb", apply: (dir) => writeFileSync(join(dir, "src", "c.ts"), `export function side${applied++}() {}\n`) },
      // Passes only when both sides are back at the commit's tree and the incremental side at its first index.
      { name: "control", apply: () => {} },
    ];
    const { code, out, err } = await capture(() => main(repo, commit, edits));

    expect(code).toBe(1);
    expect(out[0]).toStartWith("FAIL perturb: nodes ");
    expect(out.filter((l) => l.startsWith("  - nodes "))).toEqual(expect.arrayContaining([expect.stringContaining("src/c.ts::side0:1")]));
    expect(out.filter((l) => l.startsWith("  + nodes "))).toEqual(expect.arrayContaining([expect.stringContaining("src/c.ts::side1:1")]));
    expect(out.slice(-2)).toEqual(["PASS control", "1/2 edits pass"]);
    // The control re-indexes the first index of the unedited tree, not the perturbed one reverted.
    expect(err).toContain("control incremental: indexed 0, skipped 2, removed 0, 0 errors");
    expect(git("worktree", "list").split("\n")).toHaveLength(1);

    expect((await capture(() => main(repo, commit, [{ name: "control", apply: () => {} }]))).code).toBe(0);
  });
}, 180_000);

test("main refuses an index with no call tsserver resolved, leaving no worktree behind", async () => {
  await withRepo({ "src/a.ts": "export const one = 1;\n" }, async (repo, commit, git) => {
    await expect(capture(() => main(repo, commit, [{ name: "control", apply: () => {} }]))).rejects.toThrow("baseline: tsserver resolved no call");
    expect(git("worktree", "list").split("\n")).toHaveLength(1);
  });
}, 180_000);
