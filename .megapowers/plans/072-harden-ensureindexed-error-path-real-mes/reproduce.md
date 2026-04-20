# Reproduction: `indexingFailedNote` hardcodes "readonly database" regardless of real error

Batch issue `072-harden-ensureindexed-error-path-real-mes` covers four
linked defects in the `ensureIndexed` path:

- **#068** — `indexingFailedNote()` returns a hardcoded literal
- **#069** — `runLspIndexStage` (and sibling stages) have unguarded store writes
- **#070** — `lastIndexError` is sticky, has no timestamp / auto-clear
- **#071** — `ensureIndexed` has no mutex, parallel tool calls race on the store

The failing test below reproduces the **#068 surface behavior**, which is the
user-visible symptom. The underlying paths described in #069/#070/#071 are the
ways that non-readonly errors actually reach `lastIndexError` in practice; the
test uses one of them (unguarded `addEdge` in the LSP stage, per #069) to get
there deterministically.

## Steps to Reproduce

1. Check out `main` at `pi-codegraph` (commit `9eca8f21`).
2. Add `test/ensure-indexed-error-message.test.ts` (see *Failing Test* below).
3. Run `bun test test/ensure-indexed-error-message.test.ts`.

The test:

- creates a fresh temp project with a real, writable `.codegraph/graph.db`
  (no `chmod 0o444`, no permission trickery)
- registers the extension via `mod.default(mockPi)` in `CODEGRAPH_DEVMODE=1`
- monkey-patches `TsServerClient.prototype.definition` to return a valid
  location (so the LSP stage reaches the unguarded write at
  `src/indexer/lsp.ts:80`)
- monkey-patches `SqliteGraphStore.prototype.addEdge` to throw
  `new Error("tsserver crashed")` when called with an `lsp`-provenance edge
- calls the real `symbol_graph` tool once
- asserts the tool output contains `indexing-failed: tsserver crashed`

## Expected Behavior

`finalizeReadOnlyOutput` should prepend:

```
indexing-failed: tsserver crashed
```

— the actual error message captured by `ensureIndexed`'s catch block
(`src/index.ts:109-110`). The DB is demonstrably writable, so the literal
`readonly database` must **not** appear.

## Actual Behavior

The tool output is prepended with the hardcoded literal regardless of the real
error. Exact received text from the test run:

```
indexing-failed: graph may be stale (readonly database)
## alpha (function)
src/hello.ts:1:708c

### Signature
()

### Signals
[entry-point, leaf, untested]
```

The real error `"tsserver crashed"` is captured into `lastIndexError.message`
by `src/index.ts:110` and then silently discarded by `indexingFailedNote()` at
`src/index.ts:115-118`.

## Evidence

### The offending function (current `main`, `src/index.ts:115-118`)

```ts
function indexingFailedNote(): string {
  if (!lastIndexError) return "";
  return "indexing-failed: graph may be stale (readonly database)\n";
}
```

### Where `lastIndexError` gets set (current `main`, `src/index.ts:101-113`)

```ts
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  try {
    const result = await indexProject(projectRoot, store);
    if (result.errors > 0 && !dbIsWritable(projectRoot)) {
      lastIndexError = new Error("readonly database");
    } else {
      lastIndexError = null;
    }
  } catch (err) {
    lastIndexError = err instanceof Error ? err : new Error(String(err));
    // Indexing failed (likely readonly DB) — degrade gracefully and serve stale graph data.
  }
}
```

`err.message` is captured — then thrown away by `indexingFailedNote`.

### Unguarded writes feeding the catch block (`src/indexer/lsp.ts:79-80, 90-91`)

```ts
store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
```

These throw straight out of `runLspIndexStage` → `indexProject` → into
`ensureIndexed`'s catch block.

### Test output (failing on `main`)

```
81 |       expect(sgText).toContain("indexing-failed");
82 |       expect(sgText).toContain("tsserver crashed");
                          ^
error: expect(received).toContain(expected)

Expected to contain: "tsserver crashed"
Received: "indexing-failed: graph may be stale (readonly database)\n## alpha (function)\nsrc/hello.ts:1:708c\n\n### Signature\n()\n\n### Signals\n[entry-point, leaf, untested]\n"
```

Note: the first assertion (`toContain("indexing-failed")`) passes — the bug is
that `"tsserver crashed"` is replaced by `"readonly database"` in the output
for a writable DB.

### Existing "readonly" test is unaffected

`test/readonly-graceful-degradation.test.ts` (6 tests) continues to pass on
`main` because its reproduction genuinely makes the DB readonly via
`chmodSync(dbPath, 0o444)`. That test never observed the bug because the
hardcoded note happens to be correct for that one path.

## Environment

- Runtime: `bun test v1.3.11 (af24e281)`
- OS: darwin 24.6.0
- Branch: `main`, commit `9eca8f21 feat: M10 Phase 5 — remove zero-usage tools ...`
- Project: `pi-codegraph` — TypeScript, bun-native, SQLite via `bun:sqlite`

## Failing Test

Location: `test/ensure-indexed-error-message.test.ts`

```ts
import { expect, test, describe, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TsServerClient } from "../src/indexer/tsserver-client.js";
import { SqliteGraphStore } from "../src/graph/sqlite.js";

function createTestProject(): string {
  const projectRoot = join(tmpdir(), `pi-cg-err-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(
    join(projectRoot, "src/hello.ts"),
    "export function alpha() { return 1; }\nexport function beta() { return alpha(); }\n",
  );
  return projectRoot;
}

describe("batch 072: indexingFailedNote surfaces the real error message", () => {
  const testDirs: string[] = [];
  afterEach(() => {
    for (const dir of testDirs) rmSync(dir, { recursive: true, force: true });
    testDirs.length = 0;
  });

  test("non-readonly indexing failure is reported verbatim in tool output", async () => {
    const projectRoot = createTestProject();
    testDirs.push(projectRoot);

    const mod = await import("../src/index.js");
    mod.resetStoreForTesting();

    let sgExecute: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") sgExecute = tool.execute;
      },
      on() {},
    };
    const previousDev = process.env.CODEGRAPH_DEVMODE;
    process.env.CODEGRAPH_DEVMODE = "1";
    try {
      mod.default(mockPi as any);
    } finally {
      if (previousDev === undefined) delete process.env.CODEGRAPH_DEVMODE;
      else process.env.CODEGRAPH_DEVMODE = previousDev;
    }

    const originalDefinition = TsServerClient.prototype.definition;
    TsServerClient.prototype.definition = async () => ({ file: "src/hello.ts", line: 1, col: 1 });
    const originalAddEdge = SqliteGraphStore.prototype.addEdge;
    SqliteGraphStore.prototype.addEdge = function (edge: any) {
      if (edge?.provenance?.source === "lsp") throw new Error("tsserver crashed");
      return originalAddEdge.call(this, edge);
    };

    try {
      const ctx = { cwd: projectRoot };
      const sgResult = await sgExecute!("call-1", { name: "alpha" }, undefined, undefined, ctx);
      const sgText: string = sgResult.content[0]?.text ?? "";

      expect(sgText).toContain("indexing-failed");
      expect(sgText).toContain("tsserver crashed");
      expect(sgText).not.toContain("readonly database");
    } finally {
      TsServerClient.prototype.definition = originalDefinition;
      SqliteGraphStore.prototype.addEdge = originalAddEdge;
      mod.resetStoreForTesting();
    }
  });
});
```

This test FAILS on current `main` with the "readonly database" lie, and must
PASS when the bug is fixed (i.e. when `indexingFailedNote` surfaces
`lastIndexError.message` verbatim and/or the unguarded writes are guarded so
the error never reaches `lastIndexError` under this kind of transient failure).

## Reproducibility

**Always.** The test forces the condition deterministically by patching two
prototype methods. Every run of `bun test test/ensure-indexed-error-message.test.ts`
on commit `9eca8f21` produces the same wrong output.

The "organic" manifestation described in the issue (real transient
SQLite BUSY / startup race) is intermittent, but the causal chain is the same
and the user-visible string is identical.

## Scope Notes for Downstream Phases

This reproduction intentionally targets the single most visible symptom
(#068). Companion issues stage additional assertions that should land in the
plan phase:

- **#069 companion test:** `runLspIndexStage` with a mocked store that throws
  once on `addEdge` should complete with remaining edges still written (no
  exception propagates), and `result.errors` should reflect the skip rather
  than aborting the whole stage. Mirror for `runGitCoChangeStage` and
  `runAstGrepIndexStage`.
- **#070 companion test:** after `lastIndexError` is set via a forced
  failure, the *next* successful `ensureIndexed` call against a healthy
  store must clear it; and `indexingFailedNote` output should include an
  age/timestamp when non-empty.
- **#071 companion test:** `N=4` parallel `ensureIndexed` calls on an empty
  store must invoke `indexProject` exactly once (promise coalescing).

All four defects should be addressed in the single batch fix.
