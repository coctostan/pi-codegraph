import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { diffGraphs, snapshotGraph } from "../bench/index-parity.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

/** Resolves a call by its callee's name to the first `function <name>(` under `src/`, as tsserver would by import. */
function nameResolvingClient(root: string): ITsServerClient {
  return {
    async definition(file, line, col) {
      const name = /^[A-Za-z_$][\w$]*/.exec(readFileSync(join(root, file), "utf8").split("\n")[line - 1]!.slice(col - 1))?.[0];
      if (!name) return null;
      for (const rel of readdirSync(join(root, "src")).sort()) {
        const lines = readFileSync(join(root, "src", rel), "utf8").split("\n");
        const at = lines.findIndex((l) => l.includes(`function ${name}(`));
        if (at >= 0) return { file: `src/${rel}`, line: at + 1, col: lines[at]!.indexOf(`function ${name}(`) + "function ".length + 1 };
      }
      return null;
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };
}

const LIB = 'export function helper(): number {\n  return 1;\n}\n\nexport function other(): number {\n  return helper() + missing();\n}\n';
const FILES: Record<string, string> = {
  "src/lib.ts": LIB,
  "src/use.ts": 'import { helper, other } from "./lib";\n\nexport function useIt(): number {\n  return helper() + other();\n}\n',
  "src/app.ts": 'import { helper } from "./lib";\ndeclare const app: { get(path: string, h: () => number): void };\n\nfunction handler(): number {\n  return helper();\n}\n\napp.get("/x", handler);\n',
  "src/lib.test.ts": 'import { helper } from "./lib";\n\ntest("helper works", () => {\n  helper();\n});\n',
  // A root `__tests__/` path starts with the `__` the index once took for its own sentinel rows.
  "__tests__/x.ts": 'import { helper } from "../src/lib";\n\ntest("x", () => {\n  helper();\n});\n',
};

let root = "";
let work = "";
const coverageDir = () => join(work, "coverage");
const db = (name: string) => join(work, `${name}.db`);

function git(...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, stdio: "ignore" });
}

async function index(dbPath: string): Promise<void> {
  const store = new SqliteGraphStore(dbPath);
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => nameResolvingClient(root), coverageDir: coverageDir() });
    expect(result.errors).toBe(0);
  } finally {
    store.close();
  }
}

/** A V8 report covering the test's callback and `covered` (default `helper`), at their offsets in the committed tree. */
function writeCoverageReport(covered = "helper"): void {
  const testText = FILES["src/lib.test.ts"]!;
  const fn = (functionName: string, text: string, from: string, to: string) => ({
    functionName,
    ranges: [{ startOffset: text.indexOf(from), endOffset: text.indexOf(to, text.indexOf(from)) + to.length, count: 1 }],
  });
  mkdirSync(coverageDir(), { recursive: true });
  writeFileSync(join(coverageDir(), "report.json"), JSON.stringify({
    result: [
      { url: pathToFileURL(join(root, "src/lib.test.ts")).href, functions: [fn("", testText, "() => {", "});")] },
      { url: pathToFileURL(join(root, "src/lib.ts")).href, functions: [fn(covered, LIB, `export function ${covered}`, "\n}")] },
    ],
  }));
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "cg-incremental-parity-"));
  root = join(work, "repo");
  for (const dir of ["src", "__tests__"]) mkdirSync(join(root, dir), { recursive: true });
  git("init", "-q");
  // Three commits touching lib, use and app together, so each pair co-changes the git stage's minimum of twice.
  for (const rev of [1, 2, 3]) {
    for (const [file, text] of Object.entries(FILES)) {
      writeFileSync(join(root, file), rev === 3 || file === "src/lib.test.ts" ? text : `${text}// rev ${rev}\n`);
    }
    git("add", ".");
    git("commit", "-qm", `rev ${rev}`);
  }
  writeCoverageReport();
  await index(db("baseline"));
}, 60_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

test("the baseline holds an edge of every stage", () => {
  const store = new SqliteGraphStore(db("baseline"));
  try {
    const kinds = store.queryRows<{ k: string }>("SELECT DISTINCT kind || '/' || provenance_source AS k FROM edges ORDER BY k").map((r) => r.k);
    expect(kinds).toEqual(["calls/lsp", "calls/tree-sitter", "co_changes_with/git", "imports/tree-sitter", "routes_to/ast-grep", "tested_by/coverage"]);
    expect(store.queryRows("SELECT 1 FROM test_trace_steps")).not.toHaveLength(0);
  } finally {
    store.close();
  }
});

const rewrite = (file: string, edit: (text: string) => string) => () => writeFileSync(join(root, file), edit(readFileSync(join(root, file), "utf8")));
const shiftLib = rewrite("src/lib.ts", (t) => `\n${t}`);

const EDITS: Array<[name: string, apply: () => void]> = [
  ["control", () => {}],
  ["comment append to src/lib.ts", rewrite("src/lib.ts", (t) => `${t}// appended\n`)],
  ["line shift in src/lib.ts", shiftLib],
  ["callee rename in src/lib.ts", rewrite("src/lib.ts", (t) => t.replace("function helper(", "function helperRenamed("))],
  // Moves the test node a `tested_by` edge from src/lib.ts points at.
  ["line shift in src/lib.test.ts", rewrite("src/lib.test.ts", (t) => `\n${t}`)],
  // Keeps that test node, but the report's range now maps to the smaller one nested in it.
  ["nested test in src/lib.test.ts", rewrite("src/lib.test.ts", (t) => t.replace("  helper();\n", '  helper();\n  test("inner", () => {});\n'))],
  // src/use.ts calls into src/lib.ts: its edges dangle, but it is gone, so it is deleted rather than re-extracted.
  ["line shift in src/lib.ts with src/use.ts removed", () => { shiftLib(); rmSync(join(root, "src/use.ts")); }],
  // Every other file calls into src/lib.ts: their resolved calls must read unresolved again.
  ["removal of src/lib.ts", () => rmSync(join(root, "src/lib.ts"))],
  // Defines the `missing` src/lib.ts calls, left unresolved until now.
  ["addition of src/extra.ts", () => writeFileSync(join(root, "src/extra.ts"), "export function missing(): number {\n  return 2;\n}\n")],
  ["removal of __tests__/x.ts", () => rmSync(join(root, "__tests__/x.ts"))],
  // The report's `tested_by` edges and test trace must go with it.
  ["removal of the coverage report", () => rmSync(join(coverageDir(), "report.json"))],
  // The report no longer covers `helper`: its edge must go, `other`'s come.
  ["change of the coverage report", () => writeCoverageReport("other")],
];

/** Back to the committed tree and the baseline's report, an added file removed. */
function reset(): void {
  git("checkout", "-q", "--", ".");
  git("clean", "-fdq");
  writeCoverageReport();
}

function fileStats(dbPath: string) {
  const store = new SqliteGraphStore(dbPath);
  try {
    return { listed: store.listFiles(), ...store.getStatistics(root).files };
  } finally {
    store.close();
  }
}

test("getStatistics and listFiles count every indexed file, a root __tests__ one included", () => {
  expect(fileStats(db("baseline"))).toEqual({ listed: Object.keys(FILES).sort(), total: 5, stale: 0 });
});

test("a run with nothing changed re-extracts no file", async () => {
  reset();
  copyFileSync(db("baseline"), db("incremental"));
  await index(db("incremental"));
  // The coverage stage rewrites its edges every run; a re-extracted file would rewrite its own.
  const stamps = (path: string) => {
    const store = new SqliteGraphStore(path);
    try {
      return store.queryRows("SELECT source, target, kind, provenance_source, created_at FROM edges WHERE provenance_source <> 'coverage' ORDER BY 1, 2, 3, 4");
    } finally {
      store.close();
    }
  };
  expect(stamps(db("incremental"))).toEqual(stamps(db("baseline")));
});

test("a covered test that moves re-extracts no file it covers", async () => {
  reset();
  rewrite("src/lib.test.ts", (t) => `\n${t}`)();
  copyFileSync(db("baseline"), db("incremental"));
  await index(db("incremental"));
  // `helper`'s `tested_by` edge into the moved test node is the coverage stage's to rewrite, not a call to resolve anew.
  const indexedAt = (path: string) => {
    const store = new SqliteGraphStore(path);
    try {
      return store.queryRows("SELECT indexed_at FROM file_hashes WHERE file = 'src/lib.ts'");
    } finally {
      store.close();
    }
  };
  expect(indexedAt(db("incremental"))).toEqual(indexedAt(db("baseline")));
});

test.each(EDITS)("an incremental re-index after %s equals a fresh index", async (_name, apply) => {
  reset();
  apply();
  copyFileSync(db("baseline"), db("incremental"));
  await index(db("incremental"));
  rmSync(db("fresh"), { force: true });
  await index(db("fresh"));
  expect(diffGraphs(snapshotGraph(db("incremental")), snapshotGraph(db("fresh")))).toEqual([]);
  expect(fileStats(db("incremental"))).toEqual(fileStats(db("fresh")));
}, 60_000);

test("a resolver marker into a removed file lists no file", async () => {
  reset();
  rmSync(join(root, "src/lib.ts"));
  copyFileSync(db("baseline"), db("incremental"));
  const store = new SqliteGraphStore(db("incremental"));
  try {
    await resolveMissingCallers(store.findNodes("helper", "src/lib.ts")[0]!, store, root, nameResolvingClient(root));
  } finally {
    store.close();
  }
  await index(db("incremental"));
  const listed = Object.keys(FILES).filter((f) => f !== "src/lib.ts").sort();
  expect(fileStats(db("incremental"))).toEqual({ listed, total: listed.length, stale: 0 });
});

// Root reads any file, so the unreadable caller below would read.
test.skipIf(process.getuid?.() === 0)("a caller unreadable on the run that removes its callee re-extracts on the next", async () => {
  reset();
  rmSync(join(root, "src/lib.ts"));
  copyFileSync(db("baseline"), db("incremental"));
  chmodSync(join(root, "src/use.ts"), 0o000);
  const store = new SqliteGraphStore(db("incremental"));
  try {
    const result = await indexProject(root, store, { lspClientFactory: () => nameResolvingClient(root), coverageDir: coverageDir() });
    expect(result.errors).toBeGreaterThan(0);
  } finally {
    store.close();
    chmodSync(join(root, "src/use.ts"), 0o644);
  }
  await index(db("incremental"));
  rmSync(db("fresh"), { force: true });
  await index(db("fresh"));
  expect(diffGraphs(snapshotGraph(db("incremental")), snapshotGraph(db("fresh")))).toEqual([]);
}, 60_000);
