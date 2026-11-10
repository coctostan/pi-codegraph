import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphEdge, GraphNode } from "../src/graph/types.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import { traceResult } from "../src/tools/trace.js";

const FILE = "src/t.ts";

/** Trace `entry` over one file whose symbols sit one per line, as `name` of kind `kinds[name]` or `function`, and calls given as [caller, callee, call_end, evidence, provenance source]. */
function traceOf(
  names: string[],
  calls: Array<[string, string, GraphEdge["call_end"]?, string?, GraphEdge["provenance"]["source"]?]>,
  kinds: Record<string, GraphNode["kind"]> = {},
): string[] {
  const projectRoot = join(tmpdir(), `pi-cg-trace-tree-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const content = names.map((n) => `export function ${n}() {}`).join("\n") + "\n";
  writeFileSync(join(projectRoot, FILE), content);
  const hash = sha256Hex(content);
  const id = (name: string) => (name.startsWith("?") ? `__unresolved__::${name.slice(1)}:0` : `${FILE}::${name}:${names.indexOf(name) + 1}`);
  const store = new SqliteGraphStore();
  try {
    names.forEach((name, i) =>
      store.addNode({ id: id(name), kind: kinds[name] ?? "function", name, file: FILE, start_line: i + 1, end_line: i + 1, content_hash: hash }),
    );
    calls.forEach(([from, to, call_end, evidence, source], i) =>
      store.addEdge({
        source: id(from),
        target: id(to),
        kind: "calls",
        provenance: { source: source ?? "tree-sitter", confidence: 0.5, evidence: evidence ?? to, content_hash: hash },
        created_at: i,
        ...(call_end ? { call_end } : {}),
      }),
    );
    store.setFileHash(FILE, hash);
    const text = traceResult({ entry: names[0]!, file: FILE, store, projectRoot }).text;
    const body = text.split("\n");
    // Anchors are pinned elsewhere; here the tree's shape is under test.
    return body.slice(body.indexOf("mode: static (heuristic, no runtime evidence)") + 1, -1).map((l) => l.replace(/src\/t\.ts  \d+:[0-9a-f]{3}  /, "@ "));
  } finally {
    store.close();
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test("static trace indents each callee under its caller, siblings in call-end order, one without a call end last", () => {
  expect(
    traceOf(["run", "late", "early", "inner", "noSite"], [
      ["run", "late", { line: 1, col: 30 }],
      ["run", "noSite"],
      ["run", "early", { line: 1, col: 12 }],
      ["early", "inner", { line: 3, col: 9 }],
    ]),
  ).toEqual([
    "@ run",
    "  @ early",
    "    @ inner [leaf]",
    "  @ late [leaf]",
    "  @ noSite [leaf]",
  ]);
});

test("static trace places a callee called through two edges at the call that ends first", () => {
  expect(
    traceOf(["run", "a", "b"], [
      ["run", "a", { line: 1, col: 30 }],
      ["run", "b", { line: 1, col: 20 }],
      ["run", "a", { line: 1, col: 5 }, "a", "lsp"],
    ]),
  ).toEqual(["@ run", "  @ a [leaf]", "  @ b [leaf]"]);
});

test("static trace expands a callee once, a repeat or a cycle shown as a reference", () => {
  expect(
    traceOf(["run", "a", "b", "shared"], [
      ["run", "a", { line: 1, col: 10 }],
      ["run", "b", { line: 1, col: 20 }],
      ["a", "shared", { line: 2, col: 10 }],
      ["b", "shared", { line: 3, col: 10 }],
      ["shared", "run", { line: 4, col: 10 }],
    ]),
  ).toEqual([
    "@ run",
    "  @ a",
    "    @ shared",
    "      run (see above)",
    "  @ b",
    "    shared (see above)",
  ]);
});

test("static trace stops 3 calls below the entry and counts what it cut on one line", () => {
  const chain = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "side"];
  expect(
    traceOf(chain, [
      ["d0", "d1", { line: 1, col: 5 }],
      ["d1", "d2", { line: 2, col: 5 }],
      ["d2", "d3", { line: 3, col: 5 }],
      ["d3", "d4", { line: 4, col: 5 }],
      // Past the cap, a printed node and a node reached twice count nothing extra.
      ["d3", "d1", { line: 4, col: 9 }],
      ["d4", "d5", { line: 5, col: 5 }],
      ["d4", "?ext", { line: 5, col: 9 }, "ext:5:7"],
      ["d5", "d6", { line: 6, col: 5 }],
      ["d5", "side", { line: 6, col: 9 }],
      ["d6", "side", { line: 7, col: 5 }],
      ["d6", "d5", { line: 7, col: 9 }],
    ]),
  ).toEqual([
    "@ d0",
    "  @ d1",
    "    @ d2",
    "      @ d3",
    "5 more omitted beyond depth 3",
  ]);
});

test("static trace prints each unresolved callee on its own line, at its call site among its siblings", () => {
  expect(
    traceOf(["run", "a", "b"], [
      ["run", "a", { line: 1, col: 10 }],
      ["run", "?indexProjectImpl", { line: 1, col: 20 }, "indexProjectImpl:1:14"],
      ["run", "b", { line: 1, col: 30 }],
      ["a", "?helper", undefined, "helper:2:3"],
    ]),
  ).toEqual([
    "@ run",
    "  @ a",
    "    ? helper (unresolved, src/t.ts:2)",
    "  ? indexProjectImpl (unresolved, src/t.ts:1)",
    "  @ b [leaf]",
  ]);
});

test("static trace prints a node's kind only when it isn't a function", () => {
  expect(
    traceOf(
      ["run", "Store", "plain"],
      [
        ["run", "Store", { line: 1, col: 10 }],
        ["run", "plain", { line: 1, col: 20 }],
      ],
      { Store: "class" },
    ),
  ).toEqual(["@ run", "  @ Store  class [leaf]", "  @ plain [leaf]"]);
});
