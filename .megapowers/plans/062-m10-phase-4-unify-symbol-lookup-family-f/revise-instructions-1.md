## Task 1: Extract shared compact card renderer

The current Step 1 / Step 3 shape is incompatible with the spec.

`src/tools/symbol-card.ts` currently emits both of these sections in the standalone card path:
- `### Source` at `src/tools/symbol-card.ts:52-61`
- `### Exported` at `src/tools/symbol-card.ts:68-71`

But AC 6 and AC 7 require the default `symbol_graph` base to omit both. If Task 3 calls the helper exactly as Task 1 currently defines it, the default `symbol_graph` output cannot satisfy the spec.

### What to change

1. **Do not assert that `symbolCard()` and `renderSymbolCardBody()` are byte-identical.** That would force the new helper to keep the old standalone `symbol_card` shape.
2. **Make `renderSymbolCardBody()` the compact base view only** — header/identity, signature, covering tests, key relationships, and signals.
3. **Do not make `symbolCard()` a thin wrapper around that compact helper yet.** Existing internal tests like `test/tool-symbol-card-happy.test.ts` and `test/tool-symbol-card-source.test.ts` still expect the current standalone card output.

### Replace the failing-test shape

In `test/tool-symbol-card-render-body.test.ts`, drop the `symbolCard` equality assertion and assert the compact body directly:

```ts
import { renderSymbolCardBody } from "../src/tools/symbol-card.js";

const rendered = renderSymbolCardBody({ name: "foo", store, projectRoot });

expect(rendered.body).toContain("## foo (function)");
expect(rendered.body).toContain("### Signature");
expect(rendered.body).toContain("### Covering Tests");
expect(rendered.body).toContain("### Key Relationships");
expect(rendered.body).toContain("### Signals");
expect(rendered.body).not.toContain("### Source");
expect(rendered.body).not.toContain("### Exported");
```

### Replace the implementation shape

In `src/tools/symbol-card.ts`, export the compact helper, but keep `symbolCard()` preserving its existing standalone output for now:

```ts
export function renderSymbolCardBody(params: SymbolCardParams): RenderedSymbolCard {
  // resolve symbol exactly once
  // build only: identity, signature, tests, key relationships, signals
  // do NOT append Source or Exported here
}

export function symbolCard(params: SymbolCardParams): string {
  // keep the current standalone card behavior so the existing
  // tool-symbol-card-* tests still pass until the public registration is removed
}
```

If you want `symbolCard()` to reuse shared pieces, that is fine, but it must still preserve the current standalone output shape so the existing internal card tests stay green.

## Task 3: Make symbol_graph default to compact card

Two concrete problems here.

### 1. The task misses an existing legacy-neighborhood consumer

You already update a long list of neighborhood-oriented tests, but `test/tool-symbol-graph-lsp.test.ts` is missing. That file has execute-path assertions that still expect legacy neighborhood sections from the registered `symbol_graph` tool.

Update these calls to request the legacy base explicitly:

```ts
const result = await exec!(
  "tc1",
  { name: "shared", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result = await exec!(
  "tc-intf",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

```ts
const result2 = await exec!(
  "tc-a2",
  { name: "IWorker", file: "src/api.ts", include: ["neighborhood"] },
  undefined,
  undefined,
  { cwd: projectRoot },
);
```

Those call sites are at `test/tool-symbol-graph-lsp.test.ts:200`, `:312`, and `:550` in the current repo.

### 2. Do not make Task 3 own extra contract work

Task 3 should switch the **base selection** only:
- default / omitted `include` → compact card helper from Task 1
- `include: ["neighborhood"]` → legacy renderer from Task 2

Keep the existing contract append block in `src/tools/symbol-graph.ts` intact, but do not describe Task 3 as introducing new contract behavior. Right now the plan makes Task 3 and Task 5 overlap.

The base-selection code should look like this:

```ts
const useNeighborhoodBase = (include ?? []).includes("neighborhood");
const base = useNeighborhoodBase
  ? renderLegacyNeighborhoodBody(params)
  : renderSymbolCardBody({
      name: params.name,
      file: params.file,
      store: params.store,
      projectRoot: params.projectRoot,
    });
```

After you revise Task 1, the default-card test must also keep these negative assertions:

```ts
expect(withoutInclude).not.toContain("### Source");
expect(withoutInclude).not.toContain("### Exported");
expect(withoutInclude).not.toContain("### Contract");
```

## Task 4: Validate include values and preserve legacy neighborhood output

### 1. Step 2's expected failure is inaccurate

The new test uses Bun `expect(...)` assertions, so the actual failure will be an assertion failure like `expect(received).toBe(true)`, not the custom strings currently written in Step 2.

Also, with the current schema in `src/index.ts:25-34`, both of these are rejected before your Task 4 implementation:

```ts
Value.Check(schema, { name: "foo", include: ["neighborhood"] })
Value.Check(schema, { name: "foo", include: ["source"] })
```

Update Step 2 so it matches the assertion-based failure you will actually get.

### 2. The `src/index.ts` execute path must be updated too

Current `src/index.ts:212` still narrows the execute-path include type to contract-only:

```ts
include: params.include as Array<"contract"> | undefined,
```

When this task broadens the schema, update that line to match the real runtime surface:

```ts
include: params.include as Array<"neighborhood" | "contract" | "source"> | undefined,
```

Or remove the cast entirely if TypeBox inference is already sufficient.

## Task 5: Append contract sections from the shared contract renderer

This task does not have a credible RED state in the current sequence.

The contract append block already exists in the current codebase at `src/tools/symbol-graph.ts:191-195`:

```ts
if (include?.includes("contract")) {
  const rendered = renderSymbolContractBody({ name, file, store, projectRoot });
  body = `${body}${body.endsWith("\n") ? "\n" : "\n\n"}${rendered.body}`;
  hasLocalExceptions = hasLocalExceptions || rendered.hasLocalExceptions;
}
```

After Tasks 3 and 4, your new contract tests are likely already green, which means Step 2 cannot honestly say `Expected: FAIL`.

### What to do instead

Do **not** keep Task 5 in its current form. Pick one of these explicit fixes:

1. **Merge the contract append regression coverage into Task 3 / Task 4**, since the runtime behavior already exists and only the active base changes.
2. **Repurpose this task slot** to a currently uncovered acceptance criterion. The plan currently lacks automated coverage for:
   - AC 19 (no deprecation/migration ceremony in `symbol_graph` output)
   - the docs/tool-description drift part of AC 22

Do not leave Task 5 claiming a failing-test-first flow when the code under test is already present.

## Task 6: Append source sections from the shared source renderer

Two changes are needed.

### 1. Add include:["source"] not-found / ambiguous coverage

`include:["source"]` is a new include-driven runtime path. The current task only covers happy paths, but AC 17 and AC 18 require explicit not-found and ambiguity behavior for include-driven requests too.

Add assertions like these to `test/tool-symbol-graph-source-include.test.ts`:

```ts
const missing = symbolGraph({ name: "doesNotExist", include: ["source"] as any, store, projectRoot });
expect(missing).toContain('Symbol "doesNotExist" not found');
```

```ts
writeFileSync(join(projectRoot, "src/dup.ts"), "export class foo {}\n");
const dupHash = sha256Hex("export class foo {}\n");
store.addNode({
  id: "src/dup.ts::foo:1",
  kind: "class",
  name: "foo",
  file: "src/dup.ts",
  start_line: 1,
  end_line: 1,
  content_hash: dupHash,
});

const ambiguous = symbolGraph({ name: "foo", include: ["source"] as any, store, projectRoot });
expect(ambiguous).toContain('Multiple matches for "foo"');
```

### 2. Prove AC 15 by wiring the old card source path through the new helper

Right now Step 3 exports `renderSymbolSourceSection()` and uses it from `symbol_graph`, but it leaves the old source block in `symbolCard()` untouched. That does **not** prove the new include path is using the same rendering path previously used by the card.

The current source block lives at `src/tools/symbol-card.ts:50-61`. Refactor that path so the existing standalone `symbolCard()` source section is produced through the new helper while preserving the existing standalone output shape.

That means Task 6 should do both of these:

```ts
export function renderSymbolSourceSection(params: SymbolCardParams): RenderedSymbolSection {
  // shared source-section renderer using readSourceSnippet()
}
```

and then reuse it from `symbolCard()` instead of leaving a second inline `readSourceSnippet()` block behind.

## Task 7: Remove standalone symbol_card and symbol_contract registrations

This task claims AC 19, but none of its current steps verify AC 19.

Removing the registrations is fine, and the wiring/description tests are fine, but they do **not** prove that `symbol_graph` output contains no deprecation warnings or migration ceremony.

### Add an explicit output assertion

Extend an existing `symbol_graph` output test (or add a focused new one) with negative assertions like:

```ts
expect(output.toLowerCase()).not.toContain("deprecated");
expect(output).not.toContain("use symbol_graph instead");
expect(output).not.toContain("symbol_card(");
expect(output).not.toContain("symbol_contract(");
```

The cleanest places are the default-card test from Task 3 and the legacy-neighborhood test from Task 4, because AC 19 applies to both default and include-driven usage.

If you touch those files, update this task's file list accordingly. The current file list only covers registration metadata and cannot satisfy AC 19.

## Task 8: Update public docs for the unified symbol_graph surface

`[no-test]` is not valid as written.

AC 22 explicitly requires automated coverage for documentation / tool-description drift, but this task only changes prose and then runs `bun test test/extension-tool-descriptions.test.ts`, which does **not** read `README.md`, `ARCHITECTURE.md`, or `docs/tool-descriptions.md`.

### What to change

1. **Convert this into a tested docs task** or add a paired task that owns the docs drift test.
2. **Give the AC 21 audit note a concrete artifact path** under `.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/`. The sentence `record this audit note in the plan artifact text` is not actionable enough from the task alone.

### Minimum concrete test shape

Create a docs regression test with direct file reads, for example:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("public docs describe symbol_graph as the unified lookup surface", () => {
  const readme = read("README.md");
  const architecture = read("ARCHITECTURE.md");
  const guide = read("docs/tool-descriptions.md");

  expect(readme).toContain('symbol_graph({ name: "validateToken" })');
  expect(readme).toContain('include: ["neighborhood"]');
  expect(readme).toContain('include: ["contract"]');
  expect(readme).toContain('include: ["source"]');
  expect(readme).not.toContain("#### `symbol_card`");
  expect(readme).not.toContain("#### `symbol_contract`");

  expect(architecture).toContain("symbol_graph");
  expect(architecture).not.toContain("symbol_card tool");
  expect(architecture).not.toContain("symbol_contract tool");

  expect(guide).toContain("5-tool default public surface");
  expect(guide).toContain("internal-only `symbol_search`");
});
```

### Make the audit artifact explicit

Add a concrete file such as:

```text
.megapowers/plans/062-m10-phase-4-unify-symbol-lookup-family-f/audit.md
```

and record the AC 21 note there:

```md
# Downstream audit
- External downstream repo `pi-coding-tools` is intentionally excluded from this issue by explicit user direction.
- Accepted out-of-scope break for AC 21.
```
