# Revise Instructions — Iteration 1

The critical bug across tasks 2, 3, and 5: I assumed that a freshly-indexed project produces a non-fresh Trust header through the pi extension execute path. It does not. Verified live:

```
=== SYMBOL_GRAPH (fresh project, pi extension execute) ===
## foo (function)                          ← NO Trust header; fresh status was auto-suppressed by suppressFreshTrustHeader
src/app.ts:2:6726
### Signature
()

=== IMPACT (fresh project, pi extension execute) ===
No dependents found — 'foo' is an entry point with no callers.   ← NO Trust header

=== TRACE (fresh project, pi extension execute) ===
## Trust
status: heuristic                           ← Trace DOES produce heuristic, because trace.ts explicitly passes mode: "heuristic"
evidence: tree-sitter  stale-files: 0/1
mode: static (heuristic, no runtime evidence)
```

So task 4 (trace) is correct as written. Tasks 2 and 3 need their integration tests restructured to produce a genuinely non-fresh trust status. Task 5 has two sub-tests that make the same bad assumption.

The proven pattern for producing a non-fresh state at the extension level is the "readonly stale DB" trick used in `test/extension-readonly-trust-gating.test.ts`:

1. Write source file.
2. Directly seed a `SqliteGraphStore` at `<projectRoot>/.codegraph/graph.db` via `extractFile` + `sha256Hex` (from `src/indexer/tree-sitter.ts`) and `setFileHash`.
3. Mutate the source file (so files become stale relative to the stored hash).
4. `chmodSync(dbPath, 0o444)` to make the DB readonly so `ensureIndexed` cannot refresh it.
5. Register the extension and call the tool. Output now carries `## Trust\nstatus: stale\nevidence: tree-sitter  stale-files: 1/1\n` plus an `indexing-failed (<N>s ago): readonly database` note above it.

Remember to `chmodSync(dbPath, 0o644)` in the `finally` block, because `rmSync(recursive: true)` needs write access.

## Task 2: Thread suppressTrustHeader flag through finalizeReadOnlyOutput and symbol_graph

The schema sub-test is correct. The integration sub-test `"symbol_graph with suppressTrustHeader:true omits the non-fresh Trust header"` is broken: the baseline assertion

```ts
expect(baselineText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
```

will fail, because a fresh symbol_graph call against an extension-indexed project produces `status: fresh`, which is auto-suppressed — the real baseline starts with `## foo (function)`.

Rewrite the integration sub-test to use the readonly-stale-DB pattern. Replace the entire second `test(...)` block with:

```ts
test("symbol_graph with suppressTrustHeader:true omits the Trust header on a stale graph", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-sg-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

  // Seed the persisted store so a readonly-DB + mutated-source path produces status: stale.
  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const { extractFile, sha256Hex } = await import("../src/indexer/tree-sitter.js");
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
  const { chmodSync } = await import("node:fs");
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText).toContain("## Trust\nstatus: stale");
    expect(baselineText).toContain("## foo (function)");

    const suppressed = await (tool as any).execute(
      "suppressed",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("## foo (function)");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Also add `chmodSync` to the top-level `import { ... } from "node:fs"` if preferred over the dynamic import.

Note on Step 2 expected failure text: when only the schema extension is missing (no `params.suppressTrustHeader` plumbing yet), the integration test's `expect(suppressedText.includes("## Trust")).toBe(false)` will fail with Bun's standard `expect` diff format:
`error: expect(received).toBe(expected)` with `Expected: false` / `Received: true`. The schema test still fails first with the existing `Error: symbol_graph schema is missing suppressTrustHeader`. Update Step 2's expected failure text to say: "Expected: FAIL — `Error: symbol_graph schema is missing suppressTrustHeader` (schema sub-test throws first); the integration sub-test then fails with `expect(received).toBe(expected)` on `text.includes('## Trust')`."

## Task 3: Thread suppressTrustHeader flag through impact

Same root cause as Task 2. The assertion

```ts
expect(baselineText.includes("## Trust")).toBe(true);
```

will fail because a fresh-graph impact call against an extension-indexed project with no stale state also returns `status: fresh` → auto-suppressed.

Rewrite the second sub-test using the same readonly-stale-DB pattern. Replace the second `test(...)` block with:

```ts
test("impact with suppressTrustHeader:true omits the Trust header on a stale graph", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-impact-suppress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const sharedOrig = "export function shared() { return 1; }\n";
  const callerOrig = "import { shared } from './shared';\nexport function caller() { return shared(); }\n";
  writeFileSync(join(projectRoot, "src", "shared.ts"), sharedOrig);
  writeFileSync(join(projectRoot, "src", "caller.ts"), callerOrig);

  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const { extractFile, sha256Hex } = await import("../src/indexer/tree-sitter.js");
  const dbDir = join(projectRoot, ".codegraph");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "graph.db");
  const seed = new SqliteGraphStore(dbPath);
  for (const rel of ["src/shared.ts", "src/caller.ts"] as const) {
    const content = rel === "src/shared.ts" ? sharedOrig : callerOrig;
    const extracted = extractFile(rel, content);
    seed.addNode(extracted.module);
    for (const node of extracted.nodes) seed.addNode(node);
    for (const edge of extracted.edges) seed.addEdge(edge);
    seed.setFileHash(rel, sha256Hex(content));
  }
  seed.close();

  // Mutate shared to make files stale
  writeFileSync(join(projectRoot, "src", "shared.ts"), "export function shared() { return 2; }\n");
  const { chmodSync } = await import("node:fs");
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "impact");
  if (!tool) throw new Error("impact was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { symbols: ["shared"], changeType: "signature_change" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText).toContain("## Trust\nstatus: stale");
    expect(baselineText).toContain("caller");

    const suppressed = await (tool as any).execute(
      "suppressed",
      { symbols: ["shared"], changeType: "signature_change", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toContain("caller");
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update Step 2's expected failure text the same way as Task 2.

## Task 4: Thread suppressTrustHeader flag through trace

No changes required — trace always emits `mode: "heuristic"` on static paths, so the baseline `"## Trust\nstatus: heuristic"` assertion is correct.

## Task 5: Assert suppressTrustHeader does not affect indexing-failed note, devmeta footer, or body content

Two sub-tests have the same fresh-vs-non-fresh confusion.

### Sub-test 3: "suppressTrustHeader:true preserves body anchors and signals on symbol_graph"

`expect(baselineLines[0]).toBe("## Trust")` is wrong — the baseline on a fresh graph has no Trust header. Either:

**Option A (simpler):** Replace the assertion with direct equality. On a fresh graph, both baseline and suppressed should be byte-identical:

```ts
test("suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)", async () => {
  const projectRoot = createProject("body");
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "call-1",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    expect(baselineText.includes("## Trust")).toBe(false);
    expect(baselineText).toContain("## foo (function)");

    const suppressed = await (tool as any).execute(
      "call-2",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText).toBe(baselineText);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

This covers AC 13 (body content unchanged) and AC 6 (fresh + flag = already-suppressed output).

**Option B (also needed):** Add a separate sub-test that uses the readonly-stale-DB pattern so we also assert body-preservation on a non-fresh graph:

```ts
test("suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph)", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-suppress-body-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  const original = "export function bar() { return 1; }\nexport function foo() { return bar(); }\n";
  writeFileSync(join(projectRoot, "src", "app.ts"), original);

  const { SqliteGraphStore } = await import("../src/graph/sqlite.js");
  const { extractFile, sha256Hex } = await import("../src/indexer/tree-sitter.js");
  const { chmodSync } = await import("node:fs");
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
  writeFileSync(join(projectRoot, "src", "app.ts"), "export function bar() { return 2; }\nexport function foo() { return bar(); }\n");
  chmodSync(dbPath, 0o444);

  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  try {
    const baseline = await (tool as any).execute(
      "baseline",
      { name: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const baselineText = (baseline.content[0] as any).text as string;
    // Body starts after the Trust header block (3 lines).
    const trustIdx = baselineText.indexOf("## Trust\n");
    expect(trustIdx).toBeGreaterThanOrEqual(0);
    const afterTrust = baselineText.split("\n").slice(baselineText.split("\n").indexOf("## Trust") + 3).join("\n");

    const suppressed = await (tool as any).execute(
      "suppressed",
      { name: "foo", file: "src/app.ts", suppressTrustHeader: true },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const suppressedText = (suppressed.content[0] as any).text as string;
    expect(suppressedText.includes("## Trust")).toBe(false);
    expect(suppressedText).toBe(afterTrust);
  } finally {
    chmodSync(dbPath, 0o644);
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Include both Option A and Option B as two separate sub-tests in Task 5.

### Sub-test 4: "suppressTrustHeader:false is byte-identical to omitting the flag (non-fresh graph)"

`expect(omittedText.startsWith("## Trust\nstatus: heuristic")).toBe(true)` is wrong for symbol_graph. Switch this sub-test to use the `trace` tool, which reliably produces `status: heuristic`:

```ts
test("suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh)", async () => {
  const projectRoot = createProject("default");
  const tools = register();
  const tool = tools.find((candidate) => candidate.name === "trace");
  if (!tool) throw new Error("trace was not registered");

  try {
    const omitted = await (tool as any).execute(
      "call-1",
      { entry: "foo", file: "src/app.ts" },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const explicit = await (tool as any).execute(
      "call-2",
      { entry: "foo", file: "src/app.ts", suppressTrustHeader: false },
      undefined as any,
      () => {},
      { cwd: projectRoot } as any,
    );
    const omittedText = (omitted.content[0] as any).text as string;
    const explicitText = (explicit.content[0] as any).text as string;
    expect(omittedText.startsWith("## Trust\nstatus: heuristic")).toBe(true);
    expect(explicitText).toBe(omittedText);
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

### Sub-test 1 ("indexing-failed note") and sub-test 2 ("devmeta footer") are correct as written.

`setLastIndexErrorForTesting(new Error("transient scan failure"))` produces an `indexing-failed (<N>s ago): transient scan failure` note. The code clears non-readonly `lastIndexError` after the first call's output, but the assertion runs on that first call's output — so it works. Keep these two sub-tests unchanged.

### Updated Task 5 count

After revision, Task 5 should contain **five** sub-tests:
1. `indexing-failed note` (unchanged)
2. `_meta footer with CODEGRAPH_DEVMETA=1` (unchanged)
3. `body preservation on fresh graph` (Option A above)
4. `body preservation on stale graph` (Option B above)
5. `false-vs-omitted byte-equality, via trace` (rewritten to use trace)

This still fits under Task 5's single theme (composed interaction contract of the new flag with existing pipeline pieces). Update the "Covers" line to list AC 6 (fresh-idempotent) and AC 7 explicitly.

## Nothing else needs changing

Task 1 is fine. The Task 2 schema sub-test is fine. Task 3 schema sub-test is fine. Task 4 is fully correct. No task reorderings needed.
