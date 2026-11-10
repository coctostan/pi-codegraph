import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { indexProject } from "../src/indexer/pipeline.js";
import { TsServerClient, type ITsServerClient, type LspLocation } from "../src/indexer/tsserver-client.js";
import { symbolGraphResult } from "../src/tools/symbol-graph.js";
import { traceResult } from "../src/tools/trace.js";

const NOTE = "- lookups failed: 1 call (tsserver timed out or errored)";
const SOURCE = ["export function a() {", "  b();", "}", "export function b() {}", ""].join("\n");
const B_AT: LspLocation = { file: "src/main.ts", line: 4, col: 17 };

function fakeClient(definition: () => Promise<LspLocation | null>): () => ITsServerClient {
  return () => ({ definition, references: async () => [], implementations: async () => [], shutdown: async () => {} });
}
const answering = fakeClient(async () => B_AT);
const throwing = (message: string) => fakeClient(async () => { throw new Error(message); });

async function withRepo(run: (root: string, store: SqliteGraphStore) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-lookup-failure-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.ts"), SOURCE);
  const store = new SqliteGraphStore();
  try {
    await run(root, store);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}

const trace = (root: string, store: SqliteGraphStore, entry: string) => traceResult({ entry, store, projectRoot: root }).text;
const card = (root: string, store: SqliteGraphStore, name: string) => symbolGraphResult({ name, store, projectRoot: root }).text;

test("a timed-out definition lookup reads partial on the caller's trace and the callee's card until a run answers", async () => {
  await withRepo(async (root, store) => {
    await indexProject(root, store, { lspClientFactory: throwing("TsServer request timed out: definition") });
    for (const text of [trace(root, store, "a"), card(root, store, "b")]) {
      expect(text).toStartWith("Trust: partial\n");
      expect(text).toContain(NOTE);
    }
    expect(trace(root, store, "a")).toContain("? b (unresolved, src/main.ts:2)");

    await indexProject(root, store, { lspClientFactory: answering });
    for (const text of [trace(root, store, "a"), card(root, store, "b")]) {
      expect(text).toStartWith("Trust: fresh");
      expect(text).not.toContain("lookups failed");
    }
    expect(trace(root, store, "a")).not.toContain("unresolved");
    expect(store.getFailedLookups()).toEqual([]);
  });
});

test("an errored lookup counts as failed, a tsserver that never started does not", async () => {
  await withRepo(async (root, store) => {
    await indexProject(root, store, { lspClientFactory: throwing("TsServer process exited unexpectedly") });
    expect(card(root, store, "b")).toContain(NOTE);
  });
  await withRepo(async (root, store) => {
    await indexProject(root, store, { lspClientFactory: throwing("TsServer failed to start: tsserver") });
    expect(card(root, store, "b")).toStartWith("Trust: fresh");
    expect(store.getFailedLookups()).toEqual([]);
  });
});

test("a failed lookup leaves results that neither render its call nor name its callee fresh", async () => {
  await withRepo(async (root, store) => {
    // `y`'s call to `b` sits at the same line and column as `a`'s, so only its source tells the two apart.
    writeFileSync(join(root, "src", "other.ts"), ["export function y() {", "  b();", "}", "export function c() {}", ""].join("\n"));
    const client = (): ITsServerClient => ({
      definition: async (file) => {
        if (file === "src/main.ts") throw new Error("TsServer request timed out: definition");
        return null;
      },
      references: async () => [],
      implementations: async () => [],
      shutdown: async () => {},
    });
    await indexProject(root, store, { lspClientFactory: client });
    expect(card(root, store, "b")).toContain(NOTE);
    expect(trace(root, store, "y")).toContain("? b (unresolved, src/other.ts:2)");
    for (const text of [trace(root, store, "y"), card(root, store, "c")]) expect(text).toStartWith("Trust: fresh");
  });
});

test("a failed lookup whose call is edited away leaves no record", async () => {
  await withRepo(async (root, store) => {
    const timingOut = throwing("TsServer request timed out: definition");
    await indexProject(root, store, { lspClientFactory: timingOut });
    writeFileSync(join(root, "src", "main.ts"), SOURCE.replace("  b();\n", ""));
    await indexProject(root, store, { lspClientFactory: timingOut });
    expect(store.getFailedLookups()).toEqual([]);
    expect(card(root, store, "b")).toStartWith("Trust: fresh");
  });
});

test("a timed-out lookup on a member call reads partial on the member's card and its caller's traces, though the call prints nothing", async () => {
  await withRepo(async (root, store) => {
    const source = ["export class Store {", "  add() {}", "}", "export function a(s: Store) {", "  [1].map(() => s.add());", "}", ""];
    writeFileSync(join(root, "src", "main.ts"), source.join("\n"));
    await indexProject(root, store, { lspClientFactory: throwing("TsServer request timed out: definition") });
    const callback = traceResult({ file: "src/main.ts", line: 5, store, projectRoot: root }).text;
    for (const text of [card(root, store, "Store.add"), trace(root, store, "a"), callback]) {
      expect(text).toStartWith("Trust: partial\n");
      expect(text).toContain(NOTE);
      expect(text).not.toContain("? add");
    }
  });
});
test("an unchanged project's run writes no lookup record", async () => {
  for (const client of [throwing("TsServer request timed out: definition"), fakeClient(async () => null)]) {
    await withRepo(async (root, store) => {
      await indexProject(root, store, { lspClientFactory: client });
      const records = store.getFailedLookups();
      const writes: unknown[] = [];
      const write = store.setLookupFailed.bind(store);
      store.setLookupFailed = (...args) => { writes.push(args); write(...args); };
      expect((await indexProject(root, store, { lspClientFactory: client })).errors).toBe(0);
      expect(writes).toEqual([]);
      expect(store.getFailedLookups()).toEqual(records);
    });
  }
});

test("an index run leaves a failed references or implementations record alone", async () => {
  await withRepo(async (root, store) => {
    await indexProject(root, store, { lspClientFactory: answering });
    const b = store.findNodes("b", "src/main.ts")[0]!;
    const lookup = { kind: "references", source: b.id, evidence: "src/main.ts:4:17" } as const;
    store.setLookupFailed(lookup, true);
    const writes: unknown[] = [];
    const write = store.setLookupFailed.bind(store);
    store.setLookupFailed = (...args) => { writes.push(args); write(...args); };
    await indexProject(root, store, { lspClientFactory: answering });
    expect(writes).toEqual([]);
    expect(store.getFailedLookups()).toEqual([lookup]);
    expect(card(root, store, "b")).toContain("- lookups failed: callers of b (tsserver timed out or errored)");
  });
});

// The real client gives its first request a project-load grace, and answers a lookup in a file it has open within
// 1 ms, so the callers sit in files of their own: each lookup opens one, which takes longer.
test("the real tsserver at a 1 ms timeout reads partial", async () => {
  await withRepo(async (root, store) => {
    writeFileSync(join(root, "src", "main.ts"), "export function b() {}\n");
    for (const caller of ["c1", "c2", "c3", "c4"]) {
      writeFileSync(join(root, "src", `${caller}.ts`), `import { b } from "./main";\nexport function ${caller}() {\n  b();\n}\n`);
    }
    const tsserverPath = join(import.meta.dir, "..", "node_modules", ".bin", "tsserver");
    await indexProject(root, store, { lspClientFactory: (projectRoot) => new TsServerClient(projectRoot, { timeoutMs: 1, tsserverPath }) });
    const text = card(root, store, "b");
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toMatch(/- lookups failed: \d+ calls? \(tsserver timed out or errored\)/);
  });
}, 30_000);
