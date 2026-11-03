import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolverMarkerKey, SqliteGraphStore } from "../src/graph/sqlite.js";
import type { GraphNode } from "../src/graph/types.js";
import { resolveImplementations, resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
import { indexProject } from "../src/indexer/pipeline.js";
import type { ITsServerClient, LspLocation } from "../src/indexer/tsserver-client.js";
import { symbolGraphResult } from "../src/tools/symbol-graph.js";

const SOURCE = [
  "export function a() {",
  "  b();",
  "}",
  "export function b() {}",
  "export interface I { run(): void }",
  "export class C implements I { run(): void {} }",
  "",
].join("\n");
const B_AT: LspLocation = { file: "src/main.ts", line: 4, col: 17 };
const A_CALLS_B: LspLocation = { file: "src/main.ts", line: 2, col: 3 };
const TIMEOUT = "TsServer request timed out";
const STARTUP = "TsServer failed to start: /no/such/tsserver";

type Lookup = () => Promise<LspLocation[]>;
const fails = (message: string): Lookup => async () => { throw new Error(message); };

/** A client whose `references` and `implementations` run the given lookups, counting each ask. */
function client(lookups: { references?: Lookup; implementations?: Lookup; definition?: () => Promise<LspLocation | null> }) {
  const asked = { references: 0, implementations: 0 };
  const c: ITsServerClient = {
    definition: lookups.definition ?? (async () => B_AT),
    references: async () => (asked.references++, (lookups.references ?? (async () => []))()),
    implementations: async () => (asked.implementations++, (lookups.implementations ?? (async () => []))()),
    shutdown: async () => {},
  };
  return { c, asked };
}

async function withRepo(run: (root: string, store: SqliteGraphStore) => Promise<void>, definition?: () => Promise<LspLocation | null>) {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-query-lookup-failure-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.ts"), SOURCE);
  const store = new SqliteGraphStore();
  try {
    await indexProject(root, store, { lspClientFactory: () => client({ definition }).c });
    await run(root, store);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
}

const node = (store: SqliteGraphStore, name: string): GraphNode => store.findNodes(name, "src/main.ts")[0]!;
const card = (root: string, store: SqliteGraphStore, name: string) => symbolGraphResult({ name, store, projectRoot: root }).text;
const note = (what: string) => `- lookups failed: ${what} (tsserver timed out or errored)`;

test("a timed-out references lookup reads partial on the card, and the next call asks again until one answers", async () => {
  await withRepo(async (root, store) => {
    expect(card(root, store, "b")).toStartWith("Trust: fresh");
    const b = node(store, "b");
    const timingOut = client({ references: fails(TIMEOUT) });
    await resolveMissingCallers(b, store, root, timingOut.c);
    const text = card(root, store, "b");
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toContain(note("callers of b"));
    expect(card(root, store, "a")).toStartWith("Trust: fresh");

    await resolveMissingCallers(b, store, root, timingOut.c);
    expect(timingOut.asked.references).toBe(2);

    await resolveMissingCallers(b, store, root, client({}).c);
    expect(card(root, store, "b")).toStartWith("Trust: fresh");
    expect(card(root, store, "b")).not.toContain("lookups failed");
  });
});

test("a failed references record goes with the markers when a file is re-extracted", async () => {
  await withRepo(async (root, store) => {
    await resolveMissingCallers(node(store, "b"), store, root, client({ references: fails(TIMEOUT) }).c);
    store.clearFile("src/main.ts");
    await indexProject(root, store, { lspClientFactory: () => client({}).c });
    expect(card(root, store, "b")).toStartWith("Trust: fresh");
  });
});

test("a timed-out implementations lookup leaves its marker unset, reads partial, and the next call asks again", async () => {
  await withRepo(async (root, store) => {
    const i = node(store, "I");
    const timingOut = client({ implementations: fails(TIMEOUT) });
    await resolveImplementations(i, store, root, timingOut.c);
    expect(store.getMetadata(resolverMarkerKey("implementations", i.id))).toBeNull();
    const text = card(root, store, "I");
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toContain(note("implementations of I"));
    // The declared `implements` still syncs, as before the lookup failed.
    expect(store.getNeighbors(i.id, { direction: "in", kind: "implements" }).map((n) => n.node.name)).toContain("C");

    await resolveImplementations(i, store, root, timingOut.c);
    expect(timingOut.asked.implementations).toBe(2);

    await resolveImplementations(i, store, root, client({}).c);
    expect(store.getMetadata(resolverMarkerKey("implementations", i.id))).toBe("1");
    expect(card(root, store, "I")).toStartWith("Trust: fresh");
  });
});

test("a tsserver that fails to start still sets both markers and reads fresh", async () => {
  await withRepo(async (root, store) => {
    const failing = client({ references: fails(STARTUP), implementations: fails(STARTUP) });
    for (const name of ["b", "I"]) {
      const target = node(store, name);
      await resolveMissingCallers(target, store, root, failing.c);
      if (name === "I") await resolveImplementations(target, store, root, failing.c);
      expect(card(root, store, name)).toStartWith("Trust: fresh");
    }
    expect(store.getMetadata(resolverMarkerKey("callers", node(store, "b").id))).toBe("1");
    expect(store.getMetadata(resolverMarkerKey("implementations", node(store, "I").id))).toBe("1");
    await resolveMissingCallers(node(store, "b"), store, root, failing.c);
    await resolveImplementations(node(store, "I"), store, root, failing.c);
    expect(failing.asked).toEqual({ references: 2, implementations: 1 });
  });
});

test("a references answer that finds a call whose definition lookup failed clears that call's record", async () => {
  await withRepo(async (root, store) => {
    const b = node(store, "b");
    expect(card(root, store, "b")).toContain(note("1 call"));

    // An answer that misses the call leaves its record.
    await resolveMissingCallers(b, store, root, client({}).c);
    expect(card(root, store, "b")).toContain(note("1 call"));

    store.setMetadata(resolverMarkerKey("callers", b.id), null);
    await resolveMissingCallers(b, store, root, client({ references: async () => [A_CALLS_B] }).c);
    expect(store.getFailedLookups()).toEqual([]);
    const text = card(root, store, "b");
    expect(text).toStartWith("Trust: fresh");
    expect(text).toContain("Callers (1):  a");
  }, async () => { throw new Error(`${TIMEOUT}: definition`); });
});
