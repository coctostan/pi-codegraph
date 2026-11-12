import { expect, test } from "bun:test";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { createSignalComputer, formatRoleTags } from "../src/output/signals.js";

function addCall(
  store: SqliteGraphStore,
  source: string,
  target: string,
  provenanceSource: "tree-sitter" | "lsp" | "ast-grep" = "tree-sitter",
) {
  store.addEdge({
    source,
    target,
    kind: "calls",
    provenance: {
      source: provenanceSource,
      confidence: 0.5,
      evidence: "call",
      content_hash: "h",
    },
    created_at: Date.now(),
  });
}

test("createSignalComputer computes AC-aligned fan-in/out, role, coverage and framework signals", () => {
  const store = new SqliteGraphStore();
  try {
    store.markCoverageIndexed();
    const libModule = {
      id: "src/lib.ts::src/lib.ts:1",
      kind: "module" as const,
      name: "src/lib.ts",
      file: "src/lib.ts",
      start_line: 1,
      end_line: 20,
      content_hash: "h-lib",
      is_exported: false,
    };

    const shared = {
      id: "src/lib.ts::shared:2",
      kind: "function" as const,
      name: "shared",
      file: "src/lib.ts",
      start_line: 2,
      end_line: 4,
      content_hash: "h-shared",
      is_exported: true,
    };
    const entry = {
      id: "src/lib.ts::entry:5",
      kind: "function" as const,
      name: "entry",
      file: "src/lib.ts",
      start_line: 5,
      end_line: 7,
      content_hash: "h-entry",
      is_exported: true,
    };
    const helper = {
      id: "src/lib.ts::helper:10",
      kind: "function" as const,
      name: "helper",
      file: "src/lib.ts",
      start_line: 10,
      end_line: 12,
      content_hash: "h-helper",
      is_exported: false,
    };
    const util = {
      id: "src/lib.ts::util:13",
      kind: "function" as const,
      name: "util",
      file: "src/lib.ts",
      start_line: 13,
      end_line: 15,
      content_hash: "h-util",
      is_exported: false,
    };
    const extra = {
      id: "src/lib.ts::extra:16",
      kind: "function" as const,
      name: "extra",
      file: "src/lib.ts",
      start_line: 16,
      end_line: 17,
      content_hash: "h-extra",
      is_exported: false,
    };
    const callerA = {
      id: "src/a.ts::callerA:1",
      kind: "function" as const,
      name: "callerA",
      file: "src/a.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "h-a",
      is_exported: false,
    };
    const callerB = {
      id: "src/b.ts::callerB:1",
      kind: "function" as const,
      name: "callerB",
      file: "src/b.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "h-b",
      is_exported: false,
    };
    const callerC = {
      id: "src/c.ts::callerC:1",
      kind: "function" as const,
      name: "callerC",
      file: "src/c.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "h-c",
      is_exported: false,
    };
    const testNode = {
      id: "test/shared.test.ts::shared test:1",
      kind: "test" as const,
      name: "shared test",
      file: "test/shared.test.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "h-test",
      is_exported: false,
    };

    [libModule, shared, entry, helper, util, extra, callerA, callerB, callerC, testNode].forEach((node) => store.addNode(node));

    addCall(store, callerA.id, shared.id, "tree-sitter");
    addCall(store, callerA.id, shared.id, "lsp"); // duplicate caller, must not increase distinct fan-in
    addCall(store, callerB.id, shared.id, "tree-sitter");
    addCall(store, callerC.id, shared.id, "ast-grep"); // framework-mediated should come from ast-grep provenance source

    addCall(store, shared.id, helper.id, "tree-sitter");
    addCall(store, shared.id, util.id, "tree-sitter");
    addCall(store, shared.id, extra.id, "tree-sitter");
    addCall(store, entry.id, helper.id, "tree-sitter");

    store.addEdge({
      source: shared.id,
      target: testNode.id,
      kind: "tested_by",
      provenance: { source: "coverage", confidence: 0.9, evidence: "v8", content_hash: "h" },
      created_at: Date.now(),
    });

    const computer = createSignalComputer(store);

    const sharedSignals = computer.compute(shared.id);
    expect(sharedSignals.fanIn).toBe(3);
    expect(sharedSignals.fanOut).toBe(3);
    expect(sharedSignals.roles).toEqual(["hub", "framework-mediated"]);
    expect(sharedSignals.tested).toBe(true);
    expect(sharedSignals.frameworkMediated).toBe(true);

    const entrySignals = computer.compute(entry.id);
    expect(entrySignals.roles).toEqual(["entry-point"]);

    const helperSignals = computer.compute(helper.id);
    expect(helperSignals.roles).toEqual(["leaf"]);
    expect(helperSignals.tested).toBe(false);

    // modules are excluded from entry-point tagging even if exported
    store.addNode({ ...libModule, id: "src/lib.ts::src/lib.ts:99", start_line: 99, is_exported: true });
    const exportedModuleSignals = computer.compute("src/lib.ts::src/lib.ts:99");
    expect(exportedModuleSignals.roles).not.toContain("entry-point");

    expect(formatRoleTags(sharedSignals)).toBe("[hub, framework-mediated, tested]");
    expect(formatRoleTags(helperSignals)).toBe("[leaf, untested]");
  } finally {
    store.close();
  }
});

test("a node whose calls are all unresolved is no leaf, and a test takes no coverage tag", () => {
  const store = new SqliteGraphStore();
  try {
    store.markCoverageIndexed();
    const fn = (file: string, name: string, kind: "function" | "test" = "function") => {
      const node = { id: `${file}::${name}:1`, kind, name, file, start_line: 1, end_line: 2, content_hash: "h", is_exported: false };
      store.addNode(node);
      return node;
    };
    const unresolvedOnly = fn("src/a.ts", "unresolvedOnly");
    const hiddenOnly = fn("src/b.ts", "hiddenOnly");
    const importsOnly = fn("src/i.ts", "importsOnly");
    const prod = fn("src/c.ts", "prod");
    const coveringCase = fn("test/c.test.ts", "covers prod", "test");
    const helper = fn("test/d.test.ts", "helper");
    const bareCase = fn("test/e.test.ts", "does nothing", "test");

    addCall(store, unresolvedOnly.id, "__unresolved__::missing:0");
    // An `obj.m()` the LSP stage left unresolved prints nothing in `trace`, so it leaves a node a leaf.
    addCall(store, hiddenOnly.id, "__member__::push:0");
    store.addEdge({
      source: importsOnly.id,
      target: "__unresolved__::gone:0",
      kind: "imports",
      provenance: { source: "tree-sitter", confidence: 0.5, evidence: "gone", content_hash: "h" },
      created_at: Date.now(),
    });
    for (const test of [coveringCase, helper]) {
      store.addEdge({
        source: prod.id,
        target: test.id,
        kind: "tested_by",
        provenance: { source: "coverage", confidence: 1, evidence: "v8", content_hash: "h" },
        created_at: Date.now(),
      });
    }

    const computer = createSignalComputer(store);
    const tags = (id: string) => formatRoleTags(computer.compute(id));
    expect(tags(unresolvedOnly.id)).toBe("[untested]");
    expect(tags(hiddenOnly.id)).toBe("[leaf, untested]");
    expect(tags(importsOnly.id)).toBe("[leaf, untested]");
    expect(tags(prod.id)).toBe("[leaf, tested]");
    expect(tags(coveringCase.id)).toBe("");
    expect(tags(helper.id)).toBe("");
    expect(tags(bareCase.id)).toBe("[leaf]");
  } finally {
    store.close();
  }
});
