import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import piCodegraph, { getSharedStoreForTesting, resetStoreForTesting, setTsServerClientFactoryForTesting } from "../src/index.js";
import { resolverMarkerKey } from "../src/graph/sqlite.js";
import type { GraphStore } from "../src/graph/store.js";
import type { GraphNode } from "../src/graph/types.js";
import type { ITsServerClient, LspLocation } from "../src/indexer/tsserver-client.js";

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
type Definition = () => Promise<LspLocation | null>;
const fails = (message: string): Lookup => async () => { throw new Error(message); };

interface Fake { c: ITsServerClient; asked: { references: number; implementations: number } }

/** A client whose `references` and `implementations` run the given lookups, counting each ask. */
function client(lookups: { references?: Lookup; implementations?: Lookup; definition?: Definition }): Fake {
  const asked = { references: 0, implementations: 0 };
  const c: ITsServerClient = {
    definition: lookups.definition ?? (async () => B_AT),
    references: async () => (asked.references++, (lookups.references ?? (async () => []))()),
    implementations: async () => (asked.implementations++, (lookups.implementations ?? (async () => []))()),
    shutdown: async () => {},
  };
  return { c, asked };
}

type Tool = { execute: (...args: unknown[]) => Promise<{ content: Array<{ text: string }>; isError: boolean }> };

/** The extension's tools on a fixture repo, every tsserver the extension starts answering through the fake `use` last set. */
interface Repo {
  root: string;
  store: () => GraphStore;
  use: (fake: Fake) => Fake;
  card: (name: string) => Promise<string>;
  impact: (name: string) => Promise<string>;
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

async function withRepo(run: (repo: Repo) => Promise<void>, definition?: Definition) {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-query-lookup-failure-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.ts"), SOURCE);
  resetStoreForTesting();
  cleanup = () => {
    resetStoreForTesting();
    rmSync(root, { recursive: true, force: true });
  };

  let current = client({ definition });
  // The extension keeps one client per project, so the one it gets forwards each ask to the current fake.
  const forwarding: ITsServerClient = {
    definition: (...args) => current.c.definition(...args),
    references: (...args) => current.c.references(...args),
    implementations: (...args) => current.c.implementations(...args),
    shutdown: async () => {},
  };
  setTsServerClientFactoryForTesting(() => forwarding);

  const tools = new Map<string, Tool>();
  piCodegraph({ registerTool: (t: Tool & { name: string }) => tools.set(t.name, t), on() {} } as never);
  const call = async (tool: string, params: unknown) =>
    (await tools.get(tool)!.execute("c", params, undefined, undefined, { cwd: root })).content[0]!.text;

  // Index once through the tool, as the first call of a session does.
  await call("trace", { entry: "a" });
  await run({
    root,
    store: () => getSharedStoreForTesting()!,
    use: (fake) => (current = fake),
    card: (name) => call("symbol_graph", { name }),
    impact: (name) => call("impact", { symbols: [name], changeType: "behavior_change" }),
  });
}

const node = (store: GraphStore, name: string): GraphNode => store.findNodes(name, "src/main.ts")[0]!;
const note = (what: string) => `- lookups failed: ${what} (tsserver timed out or errored)`;

test("a timed-out references lookup reads partial on the card, and the next call asks again until one answers", async () => {
  await withRepo(async ({ use, card }) => {
    expect(await card("a")).toStartWith("Trust: fresh");
    const timingOut = use(client({ references: fails(TIMEOUT) }));
    const text = await card("b");
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toContain(note("callers of b"));
    expect(await card("a")).toStartWith("Trust: fresh");

    await card("b");
    expect(timingOut.asked.references).toBe(2);

    use(client({}));
    const answered = await card("b");
    expect(answered).toStartWith("Trust: fresh");
    expect(answered).not.toContain("lookups failed");
  });
});

test("a failed references record goes with the markers when a file is re-extracted", async () => {
  await withRepo(async ({ store, use, card, impact }) => {
    use(client({ references: fails(TIMEOUT) }));
    await card("b");
    // `impact` asks tsserver nothing, so it reads the record as the store keeps it.
    expect(await impact("b")).toContain(note("callers of b"));
    store().clearFile("src/main.ts");
    use(client({}));
    expect(await impact("b")).toStartWith("Trust: fresh");
  });
});

test("a timed-out implementations lookup leaves its marker unset, reads partial, and the next call asks again", async () => {
  await withRepo(async ({ store, use, card }) => {
    const i = node(store(), "I");
    const timingOut = use(client({ implementations: fails(TIMEOUT) }));
    const text = await card("I");
    expect(store().getMetadata(resolverMarkerKey("implementations", i.id))).toBeNull();
    expect(text).toStartWith("Trust: partial\n");
    expect(text).toContain(note("implementations of I"));
    // The declared `implements` still syncs, as before the lookup failed.
    expect(store().getNeighbors(i.id, { direction: "in", kind: "implements" }).map((n) => n.node.name)).toContain("C");

    await card("I");
    expect(timingOut.asked.implementations).toBe(2);

    use(client({}));
    const answered = await card("I");
    expect(store().getMetadata(resolverMarkerKey("implementations", i.id))).toBe("1");
    expect(answered).toStartWith("Trust: fresh");
  });
});

test("a tsserver that fails to start still sets both markers and reads fresh", async () => {
  await withRepo(async ({ store, use, card }) => {
    const failing = use(client({ references: fails(STARTUP), implementations: fails(STARTUP) }));
    for (const name of ["b", "I"]) expect(await card(name)).toStartWith("Trust: fresh");
    expect(store().getMetadata(resolverMarkerKey("callers", node(store(), "b").id))).toBe("1");
    expect(store().getMetadata(resolverMarkerKey("implementations", node(store(), "I").id))).toBe("1");
    await card("b");
    await card("I");
    expect(failing.asked).toEqual({ references: 2, implementations: 1 });
  });
});

test("a references answer clears the failed definition records of the calls it finds, and only those", async () => {
  const timingOut: Definition = async () => { throw new Error(`${TIMEOUT}: definition`); };
  // Every tool call re-runs the index, which asks `definition` again, so every client here times out on it.
  const answering = (references?: Lookup) => client({ references, definition: timingOut });
  await withRepo(async ({ root, store, use, card }) => {
    // `y` calls `b` at the line and column `a` does, then `d` and `b` again on that line; tree-sitter keeps the first `b`.
    writeFileSync(join(root, "src", "other.ts"), ["export function y() {", "  b(); d(); b();", "}", ""].join("\n"));
    const b = node(store(), "b");

    // An answer that misses the calls leaves their records.
    use(answering());
    expect(await card("b")).toContain(note("2 calls"));

    // A reference elsewhere on `y`'s line, as `right.b()` beside a `left.b()` whose lookup failed, clears nothing there.
    const yAt = (col: number): LspLocation => ({ file: "src/other.ts", line: 2, col });
    store().setMetadata(resolverMarkerKey("callers", b.id), null);
    use(answering(async () => [A_CALLS_B, yAt(13)]));
    const text = await card("b");
    expect(text).toContain(note("1 call"));
    expect(text).toContain("Callers (2):  a, y");

    store().setMetadata(resolverMarkerKey("callers", b.id), null);
    use(answering(async () => [A_CALLS_B, yAt(3), yAt(13)]));
    expect(await card("b")).toStartWith("Trust: fresh");
    const y = store().findNodes("y", "src/other.ts")[0]!;
    expect(store().getFailures().map((f) => [f.source, f.evidence])).toEqual([[y.id, "d:2:8"]]);
  }, timingOut);
});
