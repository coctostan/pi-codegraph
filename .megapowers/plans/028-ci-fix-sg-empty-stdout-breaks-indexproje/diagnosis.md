# Diagnosis

## Root Cause
The root cause is a **broken subprocess contract assumption in `runScan()`** in the pre-fix M3 revision.

Specifically, `src/indexer/ast-grep.ts` treated ast-grep exit code `1` as a successful “no matches” condition in `defaultExec()`, but `runScan()` still assumed the returned `stdout` would always be valid JSON and immediately called `JSON.parse(stdout)`.

That assumption is false in the CI environment described by the issue: when `sg run --json` finds no matches there, it returns **exit code `1` and empty stdout (`""`)**, not `[]`.

So the place where correct becomes incorrect is:
1. `defaultExec()` accepts exit code `1` as success and returns raw `stdout`
2. `runScan()` receives `""`
3. `runScan()` calls `JSON.parse("")`
4. Bun throws `JSON Parse error: Unexpected EOF`
5. The error bubbles through `runAstGrepIndexStage()` into `indexProject()` and then into extension auto-index paths

This is confirmed by:
- the historical pre-fix code in `296616c1`, where `runScan()` has no empty-stdout guard before `JSON.parse(stdout)`
- the reproduced historical failure stack showing the throw at `src/indexer/ast-grep.ts:156`
- the follow-up fix commit `6fc342b6`, which adds exactly the missing normalization step:
  `if (!stdout.trim()) return [];`
- the fact that the current checkout no longer fails under the same fake-`sg` condition

## Trace
### 1. Symptom
Historical repro on `296616c1` fails with:
```text
error: Invalid sg JSON output: JSON Parse error: Unexpected EOF
      at runScan (/private/tmp/pi-cg-296616c1-repro/src/indexer/ast-grep.ts:156:15)
      at async runAstGrepIndexStage (/private/tmp/pi-cg-296616c1-repro/src/indexer/ast-grep.ts:271:27)
      at async indexProject (/private/tmp/pi-cg-296616c1-repro/src/indexer/pipeline.ts:105:9)
```

### 2. Backward trace from throw site
In the pre-fix historical code (`296616c1`):
- `runScan()` immediately parses `stdout` with `JSON.parse(stdout)` after subprocess execution
- there is **no guard** for empty output

Historical code path:
```ts
stdout = await execFn(cmd, { cwd: projectRoot });
let parsed: unknown;
try {
  parsed = JSON.parse(stdout);
} catch (error) {
  throw new Error(`Invalid sg JSON output: ${message}`);
}
```

### 3. Where `stdout` came from
`stdout` comes from `defaultExec()` in `src/indexer/ast-grep.ts`, which spawns:
```ts
sg run --json --lang <lang> --pattern <pattern> <files...>
```
`defaultExec()` explicitly treats exit code `1` as success:
```ts
// sg exits 1 when no matches found (like grep) — treat 0 and 1 as success
if (code > 1) throw new Error(...)
return stdout;
```
So the code already knew “exit 1 can be normal”, but it did **not** normalize the corresponding empty-body success case.

### 4. Where the failure propagates
`runAstGrepIndexStage()` loops over rules and awaits `runScan()` for each rule. It does not catch parse errors.

`indexProject()` then calls Stage 3 unconditionally after LSP:
- `src/indexer/pipeline.ts:107`
  ```ts
  await runAstGrepIndexStage(store, projectRoot, changedFiles);
  ```
Because this await is uncaught, any `runScan()` parse error aborts the entire indexing pipeline.

That same indexing pipeline is also used by extension auto-indexing:
- `src/index.ts:77-80`
  ```ts
  async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
    if (store.listFiles().length === 0) {
      await indexProject(projectRoot, store);
    }
  }
  ```
So tool entrypoints such as `symbol_graph`, `resolve_edge`, `impact`, `trace`, and `graph_query` are all affected when the store is empty.

### 5. Root cause confirmation
I tested one variable at a time:

**Hypothesis:** The failure occurs because `runScan()` assumes no-match `sg` output is always JSON, but some environments return empty stdout instead.

**Check:** Reproduced the historical code path with a fake `sg` that exits `1` and emits empty stdout.

**Result:** Confirmed. On `296616c1`, `bun test` fails with the exact `Unexpected EOF` stack. On current HEAD, the same fake `sg` setup passes.

That confirms the root cause is the missing empty-stdout normalization in `runScan()`, not LSP, not the graph store, and not the tests themselves.

## Affected Code
### Primary broken code
- `src/indexer/ast-grep.ts`
  - `defaultExec()` — current file lines 102-116
    - accepts `sg` exit code `1` as non-fatal and returns raw stdout
  - `runScan()` — current file lines 136-162
    - historical pre-fix version lacked the current guard at lines 151-152:
      ```ts
      if (!stdout.trim()) return [];
      ```

### Propagation path
- `src/indexer/ast-grep.ts`
  - `runAstGrepIndexStage()` — lines 263-276
- `src/indexer/pipeline.ts`
  - `indexProject()` — lines 51-110
  - unconditional Stage 3 call at line 107
- `src/index.ts`
  - `ensureIndexed()` — lines 77-81
  - tool entrypoints that call `ensureIndexed()` — lines 101-203

### Historical failing location
From the reproduced historical revision `296616c1`:
- `src/indexer/ast-grep.ts:153-156` performs `JSON.parse(stdout)` without checking for empty output first

## Pattern Analysis
## Working pattern
The current fixed `runScan()` normalizes the CLI’s empty-success variant before parsing:
```ts
// sg outputs empty string (not "[]") when no matches found — treat as empty result
if (!stdout.trim()) return [];
```
This matches the actual contract observed in the CI-like reproduction: “no matches” may mean empty stdout, not only `[]`.

## Broken pattern
The historical code assumed:
1. exit code `1` means “no matches” and is okay
2. if the subprocess succeeded, stdout must contain valid JSON

Those assumptions are inconsistent with each other. If exit code `1` is treated as a normal no-match result, then `runScan()` must also tolerate all normal no-match payload shapes for that CLI/runtime.

## Specific differences between working and broken code
1. **Current code has empty-stdout normalization; historical code does not.**
2. **Historical code parses raw subprocess output unconditionally.**
3. **Current code preserves the existing parse/error behavior for real malformed JSON, but distinguishes empty no-match output from malformed JSON.**
4. **The caller chain is unchanged; only input normalization at the subprocess boundary differs.**

## Violated assumption
The violated assumption is:
> “If `sg` exits with a non-error status for no matches, its `stdout` will always be a JSON array.”

The reproduction shows that assumption is false in at least one environment/build of ast-grep.

## Dependency/environment dependency involved
The broken code depends on the exact no-match output format of the external `sg` CLI. The code already accounted for one part of that contract (exit code `1`) but failed to account for another part (empty stdout vs `[]`).

## Risk Assessment
What depends on this code:
- all indexing flows that invoke Stage 3 ast-grep scanning
- `indexProject()` callers
- extension auto-indexing when the graph store is empty
- any tests or tools that indirectly trigger indexing

What could break if this area changes:
- Stage 3 rule processing for legitimate ast-grep matches
- malformed JSON handling if normalization is too broad
- auto-index behavior for all extension tools that depend on a populated store

Related bug surface with the same root cause pattern:
- any other subprocess wrapper that treats certain exit codes as normal but assumes output shape too narrowly
- any future CLI integration where “no result” may be represented by multiple valid wire formats (`[]`, empty string, whitespace-only output)

In this codebase, the blast radius is high because `indexProject()` is a shared pipeline entrypoint and `ensureIndexed()` makes tool execution depend on successful indexing.

## Fixed When
Regression test sufficient.
1. `runScan()` returns `[]` when the `sg` subprocess returns empty or whitespace-only stdout for a no-match case.
2. `runScan()` still throws for genuinely malformed non-empty JSON output.
3. `indexProject()` continues successfully when Stage 3 receives a no-match empty-stdout response.
4. At least one regression test covers the subprocess boundary directly, and one integration path confirms `indexProject()` does not fail under the empty-stdout no-match condition.
