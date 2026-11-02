import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { symbolGraphResult } from "../src/tools/symbol-graph.js";

function node(kind: GraphNode["kind"], name: string, file: string, line: number): GraphNode {
  return { id: `${file}::${name}:${line}`, kind, name, file, start_line: line, end_line: line, content_hash: "h" };
}

test("the card lists test cases apart from the 5-name Callers cap, by file", () => {
  const store = new SqliteGraphStore();
  try {
    const target = node("function", "bar", "src/bar.ts", 1);
    const callers = [
      ...["a", "b", "c", "d", "e", "f"].map((name) => node("function", name, `src/${name}.ts`, 1)),
      node("test", "tests/x.test.ts > one", "tests/x.test.ts", 3),
      node("test", "tests/x.test.ts > two", "tests/x.test.ts", 9),
      ...Array.from({ length: 11 }, (_, i) => node("test", `tests/t${i + 10}.test.ts > case`, `tests/t${i + 10}.test.ts`, 1)),
    ];
    for (const n of [target, ...callers]) store.addNode(n);
    for (const n of callers) {
      store.addEdge({
        source: n.id,
        target: target.id,
        kind: "calls",
        provenance: { source: "lsp", confidence: 0.9, evidence: "e", content_hash: "h" },
        created_at: 1,
      });
    }

    const text = symbolGraphResult({ name: "bar", store, projectRoot: "/nonexistent" }).text;

    expect(text).toContain("  Callers (6):  a, b, c, d, e (+1 more)");
    expect(text).toContain(
      "  Test callers (13 in 12 files):  tests/t10.test.ts, tests/t11.test.ts, tests/t12.test.ts, tests/t13.test.ts, " +
        "tests/t14.test.ts, tests/t15.test.ts, tests/t16.test.ts, tests/t17.test.ts, tests/t18.test.ts, tests/t19.test.ts (+2 more files)",
    );
    expect(text).not.toContain("> one");
  } finally {
    store.close();
  }
});

test("a card whose callers are all tests has no Callers line and names a file's case count", () => {
  const store = new SqliteGraphStore();
  try {
    const target = node("function", "bar", "src/bar.ts", 1);
    const tests = [node("test", "tests/x.test.ts > one", "tests/x.test.ts", 3), node("test", "tests/x.test.ts > two", "tests/x.test.ts", 9)];
    for (const n of [target, ...tests]) store.addNode(n);
    for (const n of tests) {
      store.addEdge({
        source: n.id,
        target: target.id,
        kind: "calls",
        provenance: { source: "lsp", confidence: 0.9, evidence: "e", content_hash: "h" },
        created_at: 1,
      });
    }

    const text = symbolGraphResult({ name: "bar", store, projectRoot: "/nonexistent" }).text;

    expect(text).not.toContain("  Callers (");
    expect(text).toContain("  Test callers (2 in 1 file):  tests/x.test.ts (2)");
  } finally {
    store.close();
  }
});
