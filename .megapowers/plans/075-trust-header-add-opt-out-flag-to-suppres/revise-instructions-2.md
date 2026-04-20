# Revise Instructions — Iteration 2

Two remaining issues, both verified live against the codebase.

## Task 3: Impact integration test missing a resolved `calls` edge

Current status: the readonly-stale-DB pattern is correctly applied, but the seed uses only `extractFile` output, which produces **unresolved** cross-file edges like `src/caller.ts::caller:2 --calls--> __unresolved__::shared:0`. As a result, `impact({ symbols: ["shared"] })` returns:

```
indexing-failed (0s ago): readonly database
## Trust
status: stale
evidence: tree-sitter  stale-files: 1/2
No dependents found — 'shared' is an entry point with no callers.
```

The baseline assertion `expect(baselineText).toContain("caller")` fails because `caller` is not named in the "no dependents" diagnostic.

### Fix

Add one manual resolved `calls` edge between the seed step and `seed.close()`. Insert this block after the `for (const rel of [...])` loop, just before `seed.close();`:

```ts
  // Manually add the resolved caller → shared calls edge so impact can traverse it.
  seed.addEdge({
    source: "src/caller.ts::caller:2",
    target: "src/shared.ts::shared:1",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.8,
      evidence: "shared:2",
      content_hash: sha256Hex(callerOrig),
    },
    created_at: 1,
  });
  seed.close();
```

Verified live: with this edge added, the `impact` baseline output becomes:

```
indexing-failed (0s ago): readonly database
## Trust
status: stale
evidence: tree-sitter  stale-files: 1/2
src/caller.ts:2:e9fd  caller  breaking  depth:1  [fan-in:0, fan-out:1, ...]
```

Both `"## Trust\nstatus: stale"` and `"caller"` assertions then pass.

No other changes to Task 3 are needed. The `import { SqliteGraphStore, extractFile, sha256Hex }` already imports `sha256Hex`, which is the only new dependency for the manual `addEdge` call's `content_hash`.

## Task 5: Sub-test 1 "suppressTrustHeader:true still renders the indexing-failed note" is broken

Current status: the test does

```ts
// warm call
await (tool as any).execute("warm", ...);
// inject error
setLastIndexErrorForTesting(new Error("transient scan failure"));
// call with flag
const result = await (tool as any).execute("call-with-flag", ...);
```

This doesn't work. `ensureIndexed()` runs on every tool call and unconditionally sets `lastIndexError = null` on successful re-index (see `src/index.ts:127-132`). So the injected `transient scan failure` error is wiped before `finalizeReadOnlyOutput` reads it. Verified live: the assertion `expect(text).toMatch(/indexing-failed \(\d+s ago\): transient scan failure/)` fails because the output contains no `indexing-failed` line at all.

### Fix

Replace sub-test 1 to use the same readonly-stale-DB pattern used elsewhere — this produces a *real* `indexing-failed (<N>s ago): readonly database` note naturally, and it survives across tool calls because the clear-guard at `src/index.ts:165` explicitly skips error messages equal to `"readonly database"`. Replace the entire first `test(...)` block in `test/extension-suppress-trust-header-interactions.test.ts` with:

```ts
test("suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-suppress-idxfail-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const seed = new SqliteGraphStore(dbPath);
  const extracted = extractFile("src/app.ts", original);
  seed.addNode(extracted.module);
  for (const node of extracted.nodes) seed.addNode(node);
  for (const edge of extracted.edges) seed.addEdge(edge);
  seed.setFileHash("src/app.ts", sha256Hex(original));
  seed.close();
  writeFileSync(
    join(projectRoot, "src", "app.ts"),
    "export function bar() { return 2; }\nexport function foo() { return bar(); }\n",
  );
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const result = await (tool as any).execute(
      "call-with-flag",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const text = (result.content[0] as any).text as string;
    expect(text.includes("## Trust")).toBe(false);
    expect(text).toMatch(/indexing-failed \(\d+s ago\): readonly database/);
    expect(text).toContain("## foo (function)");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Note the assertion changes:
- Drop the `setLastIndexErrorForTesting(...)` setup/teardown (no longer used in this sub-test).
- Regex matches `readonly database` instead of `transient scan failure` — the literal error message produced by the readonly-DB path.

Since `setLastIndexErrorForTesting` is no longer used by any sub-test, you can also drop it from the import at the top of `test/extension-suppress-trust-header-interactions.test.ts`:

```ts
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
```

(Remove the `setLastIndexErrorForTesting` import line.)

## Nothing else needs changing

Tasks 1, 2, 4 are fine. Task 5 sub-tests 2, 3, 4, and 5 are fine.

No changes to the five-sub-test count or the AC traceability table in `plan.md` (sub-test 1 still covers AC 12).
