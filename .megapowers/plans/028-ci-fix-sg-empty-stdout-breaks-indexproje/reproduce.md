# Reproduction: `sg run --json` empty stdout breaks `indexProject` on the pre-fix M3 revision

## Steps to Reproduce
1. Extract the pre-fix Stage 3 revision (`296616c1`, immediately before `6fc342b6 fix: handle empty sg stdout as no matches in runScan`) into a temporary directory:
   ```sh
   REPRO=/tmp/pi-cg-296616c1-repro
   rm -rf "$REPRO"
   mkdir -p "$REPRO"
   git archive 296616c1 | tar -x -C "$REPRO"
   ln -sfn /Users/maxwellnewman/pi/workspace/pi-codegraph/node_modules "$REPRO/node_modules"
   ```
2. Put a fake `sg` binary first on `PATH` that simulates the CI no-match behavior described in the issue: exit code `1` and **empty stdout**.
   ```sh
   mkdir -p "$REPRO/fakebin"
   cat > "$REPRO/fakebin/sg" <<'SH'
   #!/bin/sh
   exit 1
   SH
   chmod +x "$REPRO/fakebin/sg"
   ```
3. Run a pre-existing test that calls `indexProject()` but does not directly test Stage 3:
   ```sh
   cd "$REPRO"
   PATH="$REPRO/fakebin:$PATH" bun test test/indexer-index-project.test.ts --timeout 10000
   ```
4. Optional confirmation: run the whole historical suite under the same fake-`sg` environment:
   ```sh
   PATH="$REPRO/fakebin:$PATH" bun test
   ```
5. Compare with the current checkout (`1c2bb956`) under the same fake-`sg` setup:
   ```sh
   FAKE=/tmp/pi-cg-fake-sg-current
   rm -rf "$FAKE"
   mkdir -p "$FAKE"
   cat > "$FAKE/sg" <<'SH'
   #!/bin/sh
   exit 1
   SH
   chmod +x "$FAKE/sg"

   PATH="$FAKE:$PATH" bun test test/indexer-index-project.test.ts --timeout 10000
   ```

## Expected Behavior
When `sg run --json` finds no matches, Stage 3 should treat that as an empty result set and allow `runAstGrepIndexStage()` and `indexProject()` to complete normally.

## Actual Behavior
On the pre-fix revision (`296616c1`), empty stdout is passed into `JSON.parse("")` inside `runScan()`, which throws and aborts `indexProject()`.

Exact error output from the historical repro:
```text
151 |   let parsed: unknown;
152 |   try {
153 |     parsed = JSON.parse(stdout);
154 |   } catch (error) {
155 |     const message = error instanceof Error ? error.message : String(error);
156 |     throw new Error(`Invalid sg JSON output: ${message}`);
                    ^
error: Invalid sg JSON output: JSON Parse error: Unexpected EOF
      at runScan (/private/tmp/pi-cg-296616c1-repro/src/indexer/ast-grep.ts:156:15)
      at async runAstGrepIndexStage (/private/tmp/pi-cg-296616c1-repro/src/indexer/ast-grep.ts:271:27)
      at async indexProject (/private/tmp/pi-cg-296616c1-repro/src/indexer/pipeline.ts:105:9)
      at async <anonymous> (/private/tmp/pi-cg-296616c1-repro/test/indexer-index-project.test.ts:39:26)
```

The current checkout (`1c2bb956`) does **not** reproduce the failure under the same fake-`sg` setup:
```text
bun test v1.3.9 (cf6cdbbb)

 4 pass
 0 fail
 15 expect() calls
Ran 4 tests across 1 file. [192.00ms]
```

## Evidence
### Recent change history
- `296616c1f392925170150fc8024eae42ea701e65` — `feat: ship 024-m3-impact-analysis-ast-grep-rule-engine`
- `6fc342b666f35055a681dc09552d392f652a4806` — `fix: handle empty sg stdout as no matches in runScan`
- `0ba9d71e106d65207709c07d995fec5f1c2a3223` — squash merge commit that already includes the fix

### Minimal historical function repro
A standalone reproduction of the **pre-fix** `runScan()` logic with `execFn => ""` throws:
```text
Error: Invalid sg JSON output: JSON Parse error: Unexpected EOF
Error: Invalid sg JSON output: JSON Parse error: Unexpected EOF
    at runScan (/private/tmp/repro-old-runscan.ts:16:15)
```

### Whole-suite blast radius on the historical revision
Running `bun test` in `296616c1` with the fake empty-stdout `sg` produced:
```text
115 pass
11 fail
338 expect() calls
Ran 126 tests across 31 files. [3.37s]
```

Observed failing tests:
1. `indexProject indexes .ts files under root, excludes node_modules, and persists nodes/edges + file hashes`
2. `indexProject deletes missing files and continues when a file cannot be read`
3. `indexProject re-indexes a changed file: removes old nodes and stores new ones (criterion 23)`
4. `indexProject runs LSP stage and upgrades unresolved call edge to lsp provenance`
5. `indexProject indexes TSX function components`
6. `extension shares singleton store instance across symbol_graph and resolve_edge`
7. `extension auto-indexes project on first tool call when DB is empty`
8. `tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render`
9. `tool path: interface symbol_graph resolves implementations, persists edge, and renders Implementations section`
10. `non-interface symbol_graph output remains unchanged (no Implementations section)`
11. `symbol_graph Implementations section includes agent-provenance implements edges`

### Current checkout behavior
- Direct current-HEAD `indexProject()` run with fake empty-stdout `sg` returned:
  ```json
  {"indexed":1,"skipped":0,"removed":0,"errors":0}
  ```
- Full current suite also passes in the normal environment:
  ```text
  164 pass
  0 fail
  502 expect() calls
  Ran 164 tests across 67 files. [4.81s]
  ```

### Actual local `sg` behavior
On this machine, the real `sg` binary does **not** match the CI behavior from the issue. For a no-match scan it returns exit code `1` with stdout `[]\n`:
```text
stdout_repr= '[]\n'
stderr_repr= ''
exit= 1
```
So the bug is environment-specific: it requires an `sg` build/runtime that emits an empty string instead of `[]` for no-match results.

## Environment
- Repo root: `/Users/maxwellnewman/pi/workspace/pi-codegraph`
- Current branch: `fix/028-ci-fix-sg-empty-stdout-breaks-indexproje`
- Current HEAD: `1c2bb95605846cd26c5c1a6b542ca120a781fe95`
- Historical bad revision reproduced: `296616c1f392925170150fc8024eae42ea701e65`
- Fix commit in history: `6fc342b666f35055a681dc09552d392f652a4806`
- OS: macOS 26.3 (`Darwin 25.3.0`, arm64)
- Bun: `1.3.9`
- Node: `v25.6.1`
- ast-grep: `0.41.0`

## Failing Test
Not feasible in the **current** checkout because the fix is already present here and the relevant tests pass, even when `sg` is stubbed to exit `1` with empty stdout.

Historical failing command:
```sh
PATH="$REPRO/fakebin:$PATH" bun test test/indexer-index-project.test.ts --timeout 10000
```
This fails on `296616c1` with the exact `Invalid sg JSON output: JSON Parse error: Unexpected EOF` stack shown above.

## Reproducibility
- **Current checkout (`1c2bb956`)**: Not reproducible.
- **Historical pre-fix revision (`296616c1`) with CI-like empty-stdout `sg` behavior**: Always reproducible.
- **Specific condition required**: `sg run --json` must return an empty string on no-match results rather than `[]`.
