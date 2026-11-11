import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countMembers, judgeNewerIndex, judgeOlderWriter, report, trustOf } from "../bench/version-skew.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

const NOT_FOUND = { isError: true, text: 'Trust: fresh\nSymbol "SqliteGraphStore.addEdge" not found' };
const RESOLVED = { isError: false, text: "Trust: fresh\nSqliteGraphStore.addEdge  src/graph/sqlite.ts" };

test("trustOf reads the Trust line's level, null without one", () => {
  expect(trustOf("Trust: fresh\nx")).toBe("fresh");
  expect(trustOf("a\nTrust: stale (2 files changed)")).toBe("stale");
  expect(trustOf("no header")).toBeNull();
});

test("judgeOlderWriter fails the shape's before-state, naming what it saw", () => {
  const r = judgeOlderWriter({ answer: NOT_FOUND, membersBefore: 54, membersAfterOlder: 0, members: 0, freshMembers: 54 });
  expect(r.name).toBe("older-writer");
  expect(r.problems).toEqual(["SqliteGraphStore.addEdge not resolved", "0 Class.member nodes against 54 in a fresh index"]);
  expect(r.seen).toBe(
    'symbol_graph SqliteGraphStore.addEdge: Symbol "SqliteGraphStore.addEdge" not found under Trust: fresh; Class.member nodes 54 → 0 after the older run, 0 after the current answer, 54 in a fresh index',
  );
});

test("judgeOlderWriter passes a resolved member under Trust: fresh with every member back", () => {
  const r = judgeOlderWriter({ answer: RESOLVED, membersBefore: 54, membersAfterOlder: 0, members: 54, freshMembers: 54 });
  expect(r.problems).toEqual([]);
  expect(r.seen).toStartWith("symbol_graph SqliteGraphStore.addEdge: resolved under Trust: fresh;");
});

test("judgeOlderWriter fails a resolved answer that isn't fresh, and a replay that proves nothing", () => {
  const stale = { isError: false, text: RESOLVED.text.replace("fresh", "stale") };
  expect(judgeOlderWriter({ answer: stale, membersBefore: 54, membersAfterOlder: 0, members: 54, freshMembers: 54 }).problems).toEqual([
    "Trust: stale, not fresh",
  ]);
  // The older run must have dropped members, and a fresh index must hold some, or the comparison is vacuous.
  expect(judgeOlderWriter({ answer: RESOLVED, membersBefore: 54, membersAfterOlder: 54, members: 54, freshMembers: 54 }).problems).toEqual([
    "the older run left all 54 Class.member nodes in place: the replay proves nothing",
  ]);
  expect(judgeOlderWriter({ answer: NOT_FOUND, membersBefore: 0, membersAfterOlder: 0, members: 0, freshMembers: 0 }).problems).toEqual([
    "SqliteGraphStore.addEdge not resolved",
    "the older run left all 0 Class.member nodes in place: the replay proves nothing",
    "a fresh index holds no Class.member node",
  ]);
});

const NEWER = { indexVersion: 6, codeVersion: 5, before: "b9cf378d".padEnd(64, "0"), after: "b9cf378d".padEnd(64, "0") };

test("judgeNewerIndex fails the shape's before-state on every count, naming what it saw", () => {
  const r = judgeNewerIndex({ ...NEWER, answer: { isError: false, text: "Trust: fresh\nopenDb  src/graph/sqlite.ts" }, after: "30cbedac".padEnd(64, "0") });
  expect(r.name).toBe("newer-index");
  expect(r.problems).toEqual([
    "graph.db changed",
    "Trust: fresh, not stale",
    "no line names index version 6 and code version 5",
    "no recommendation to restart pi",
  ]);
  expect(r.seen).toBe("index version 6, code version 5; Trust: fresh; graph.db sha256 b9cf378d… → 30cbedac…");
});

test("judgeNewerIndex passes an untouched db read as stale, naming both versions and a restart", () => {
  const text = "Trust: stale\n- index version 6 is newer than this code's version 5\n- recommendation: restart pi to load the newer codegraph";
  expect(judgeNewerIndex({ ...NEWER, answer: { isError: false, text } }).problems).toEqual([]);
  // Both numbers must sit on one line that says version.
  const split = "Trust: stale\n- index version 6\n- code version 5\n- Restart pi";
  expect(judgeNewerIndex({ ...NEWER, answer: { isError: false, text: split } }).problems).toEqual([
    "no line names index version 6 and code version 5",
  ]);
});

test("report prints PASS or FAIL per case with what it saw and exits 0 only when all pass", () => {
  const pass = { name: "older-writer", problems: [], seen: "s1" };
  const fail = { name: "newer-index", problems: ["graph.db changed", "Trust: fresh, not stale"], seen: "s2" };
  expect(report([pass])).toEqual({ lines: ["PASS older-writer — s1", "1/1 cases pass"], code: 0 });
  expect(report([pass, fail])).toEqual({
    lines: ["PASS older-writer — s1", "FAIL newer-index: graph.db changed; Trust: fresh, not stale — s2", "1/2 cases pass"],
    code: 1,
  });
});

test("countMembers counts function nodes named after a class in their own file", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-skew-members-"));
  try {
    const db = join(dir, "graph.db");
    const store = new SqliteGraphStore(db);
    const node = (kind: "class" | "function", name: string, file: string, line: number) =>
      store.addNode({ id: `${file}::${name}:${line}`, kind, name, file, start_line: line, end_line: line, content_hash: "h" });
    node("class", "C", "a.ts", 1);
    node("function", "C.m", "a.ts", 2);
    node("function", "C.n", "a.ts", 3);
    node("function", "Cx.m", "a.ts", 4); // shares C's prefix, not its dot
    node("function", "D.x", "a.ts", 5); // no class D
    node("function", "C.o", "b.ts", 1); // C is another file's class
    node("function", "f", "a.ts", 6);
    store.close();
    expect(countMembers(db)).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
