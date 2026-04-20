---
id: 7
title: "RC-D stickiness: clear lastIndexError on evidence of store health"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/index.ts
files_to_create:
  - test/last-index-error-clear-on-health.test.ts
---

When a tool successfully produces output via `finalizeReadOnlyOutput`, the
store responded to reads — treat that as evidence of store health and
clear `lastIndexError`. Do **not** clear when the literal message is
`"readonly database"` (verified-persistent, set by the
`result.errors > 0 && !dbIsWritable(projectRoot)` branch in
`ensureIndexed`).

**Files:**
- Modify: `src/index.ts`
- Create: `test/last-index-error-clear-on-health.test.ts`

**Step 1 — Write the failing test**
The previous design (listFiles throws on call-1 only) is green on baseline:
`ensureIndexed`'s existing happy-path branch at `src/index.ts:106-107` already
clears `lastIndexError` when call-2's `indexProject` returns with
`errors === 0`. That's not a real red/green driver for the clear-on-success
hook.

Instead, drive `ensureIndexed.catch` with a configurable `listFiles` throw so
`lastIndexError` is reliably set at the start of every tool call. Then
introspect `getLastIndexErrorForTesting()` after each call to prove the
post-prefix hook ran for transient messages and was bypassed for the literal
`"readonly database"`. Also introduce a test-only `setLastIndexErrorForTesting`
setter so Task 8 can upgrade its signature to include `setAt`.

Create `test/last-index-error-clear-on-health.test.ts`:

```ts
import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile, sha256Hex } from "../src/indexer/tree-sitter.js";
function createTestProject(): string {
  const root = join(tmpdir(), `pi-cg-sticky-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return root;
}
function populateStore(projectRoot: string): void {
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const store = new SqliteGraphStore(join(dbDir, "graph.db"));
  const content = "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n";
  const extracted = extractFile("src/hello.ts", content);
  store.addNode(extracted.module);
  for (const node of extracted.nodes) store.addNode(node);
  for (const edge of extracted.edges) store.addEdge(edge);
  store.setFileHash("src/hello.ts", sha256Hex(content));
  store.close();
}
describe("RC-D: lastIndexError clears on store-health evidence", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  test("finalizeReadOnlyOutput clears transient lastIndexError but preserves 'readonly database'", async () => {
    const root = createTestProject();
    dirs.push(root);
    populateStore(root);
    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();
    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    const prevDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (prevDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = prevDev;
    }

    // Patch listFiles to throw a configurable message on every call. The
    // throw propagates up through `indexProject` into `ensureIndexed`'s
    // catch at `src/index.ts:109-112`, which sets
    // `lastIndexError = new Error(pendingMessage)`. This reliably primes
    // the flag at the top of each tool call, regardless of the pre-populated
    // store's hash-match skip path.
    const origListFiles = SqliteGraphStore.prototype.listFiles;
    let pendingMessage: string | null = null;
    SqliteGraphStore.prototype.listFiles = function () {
      if (pendingMessage) throw new Error(pendingMessage);
      return origListFiles.call(this);
    };

    try {
      const ctx = { cwd: root };
      // --- Phase 1: transient non-readonly error ---
      // The hook must clear lastIndexError AFTER the note is rendered.
      pendingMessage = "transient scan failure";
      const r1 = await sgExecute!("c1", { name: "alpha" }, undefined, undefined, ctx);
      const t1: string = r1.content[0]?.text ?? "";
      // THIS call's output still carries the accurate message (Task 1's
      // contract): the clear hook runs AFTER the note is built.
      expect(t1).toContain("alpha");
      expect(t1).toContain("indexing-failed");
      expect(t1).toContain("transient scan failure");
      // Post-prefix hook must have wiped the flag by the time the call returns.
      expect(mod.getLastIndexErrorForTesting()).toBeNull();
      // --- Phase 2: verified-readonly literal ---
      // The hook must NOT clear when the message is exactly "readonly database".
      pendingMessage = "readonly database";
      const r2 = await sgExecute!("c2", { name: "alpha" }, undefined, undefined, ctx);
      const t2: string = r2.content[0]?.text ?? "";
      expect(t2).toContain("alpha");
      expect(t2).toContain("indexing-failed");
      expect(t2).toContain("readonly database");
      // Flag survives — the "readonly database" literal is verified-persistent.
      expect(mod.getLastIndexErrorForTesting()?.message).toBe("readonly database");
      // --- Phase 3: sanity check via the test setter ---
      // Confirm the new setter is callable and can reset state.
      mod.setLastIndexErrorForTesting(null);
      expect(mod.getLastIndexErrorForTesting()).toBeNull();
    } finally {
      SqliteGraphStore.prototype.listFiles = origListFiles;
      mod.setLastIndexErrorForTesting(null);
      mod.resetStoreForTesting();
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `bun test test/last-index-error-clear-on-health.test.ts`

Expected: FAIL — on baseline the helper does not exist yet, so Bun prints:
```
TypeError: mod.setLastIndexErrorForTesting is not a function
    at .../test/last-index-error-clear-on-health.test.ts
```

Even after scaffolding the setter (but before adding the clear hook), the
test still fails at:
```
error: expect(received).toBeNull()

Received: [Error: transient scan failure]
```
because `finalizeReadOnlyOutput` has no clear-on-healthy-read hook, so the
transient error survives call-1.

**Step 3 — Write minimal implementation**
Two edits to `src/index.ts`:

(a) Add a test-only setter next to `getLastIndexErrorForTesting` at
`src/index.ts:70-72`. Task 8 will later upgrade the signature to include
`setAt` for the age timestamp; keep Task 7's shape `Error | null`:

```ts
export function setLastIndexErrorForTesting(error: Error | null): void {
  lastIndexError = error;
}
```

(b) Edit `finalizeReadOnlyOutput` at `src/index.ts:120-130`. The clear
decision must happen **after** `indexingFailedNote()` has been prepended —
otherwise it would suppress the current call's note too, which would break
Task 1's first-call assertion that the real captured message is surfaced
verbatim. This task's contract is explicitly "the *second* tool invocation
against a healthy store does not contain the 'indexing-failed' note"
(Fixed When #6).
Before:
```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```
After:
```ts
function finalizeReadOnlyOutput(
  toolName: string,
  params: Record<string, unknown>,
  toolOutput: string,
  store: GraphStore,
  projectRoot: string,
): string {
  const withoutFreshHeader = suppressFreshTrustHeader(toolOutput);
  const withIndexingNote = indexingFailedNote() + withoutFreshHeader;
  // Reaching this point means the tool's read path against the store
  // succeeded and produced output. Clear transient (non-readonly)
  // lastIndexError AFTER the note is built so THIS tool output still
  // carries the accurate error message (Task 1's contract), but the NEXT
  // tool call starts with a clean flag. The "readonly database" literal is
  // verified-persistent via ensureIndexed's `result.errors > 0 &&
  // !dbIsWritable(projectRoot)` branch and must stay set across tool calls.
  if (
    lastIndexError &&
    lastIndexError.message !== "readonly database" &&
    withoutFreshHeader.trim().length > 0
  ) {
    lastIndexError = null;
  }

  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
}
```

**Step 4 — Run test, verify it passes**

Run: `bun test test/last-index-error-clear-on-health.test.ts`

Expected: PASS — Phase 1 (transient): `t1` contains `alpha`,
`indexing-failed`, and `transient scan failure`; after the call,
`getLastIndexErrorForTesting()` returns `null`. Phase 2 (readonly literal):
`t2` contains `alpha` and `readonly database`; the flag survives with
message `"readonly database"`. Phase 3: the setter resets state cleanly.

**Step 5 — Verify no regressions**

Run: `bun test`
Expected: all passing. Key regression check:
`test/readonly-graceful-degradation.test.ts` at line 197 chmods the DB
0o444 → every indexing attempt fails writability → `ensureIndexed` sets
the literal `lastIndexError = new Error("readonly database")`. The new
clear-condition preserves it because the message equals the literal.
