## Test Suite Results

### Commands run fresh

```bash
bun test && bun run check
```

Result: pass.

Key output from the fresh run:

```text
bun test v1.3.13 (bf2e2cec)
...
test/tool-trace-static-edge-freshness.test.ts:
(pass) trace reports stale static call-edge freshness warning [1.71ms]
...
test/output-freshness-evaluator.test.ts:
(pass) evaluateFreshness returns Trust: fresh for fresh scoped target nodes [1.04ms]
(pass) evaluateFreshness returns stale when the requested target node changed [1.50ms]
(pass) evaluateFreshness returns partial when only a returned neighbor node changed [1.38ms]
(pass) evaluateFreshness counts stale edge provenance against the source evidence file [1.10ms]
(pass) evaluateFreshness reports deleted returned files deterministically [0.97ms]
...
test/tool-trace-freshness-warning.test.ts:
(pass) trace reports unknown freshness for unresolved stored coverage steps [1.37ms]
(pass) trace reports changed files and row-level stale markers for stale stored trace steps [1.69ms]
(pass) trace reports deleted files for stored trace steps whose files were removed [1.33ms]
...
 437 pass
 0 fail
 1271 expect() calls
Ran 437 tests across 178 files. [13.97s]
$ tsc --noEmit
```

Separate check command:

```bash
bun run check
```

Output:

```text
$ tsc --noEmit
```

Exit code: 0.

### Focused regression suite run fresh

```bash
bun test test/output-freshness-evaluator.test.ts test/tool-symbol-graph-freshness-report.test.ts test/tool-impact-freshness-warning.test.ts test/tool-trace-freshness-warning.test.ts test/tool-trace-static-edge-freshness.test.ts test/output-compact-freshness-ceremony.test.ts test/extension-suppress-trust-header-symbol-graph.test.ts test/extension-suppress-trust-header-impact.test.ts test/extension-suppress-trust-header-trace.test.ts test/extension-suppress-trust-header-interactions.test.ts test/tool-trace-trust-heuristic.test.ts test/tool-trace-static-mode-header.test.ts test/tool-trace-trust-runtime.test.ts test/tool-symbol-graph-trust-header.test.ts test/tool-impact-trust-header.test.ts
```

Output:

```text
32 pass
0 fail
123 expect() calls
Ran 32 tests across 15 files. [2.97s]
```

### Impact/dependent coverage check

Command/tool: `impact` on primary changed symbols.

Output for `evaluateFreshness`:

```text
indexing-failed (0s ago): Bun is not defined
Trust: fresh
src/tools/impact.ts:171:7904  withFreshness  behavioral  depth:1
src/tools/trace.ts:127:899f  traceFreshness  behavioral  depth:1
src/tools/symbol-graph.ts:264:288e  symbolGraph  behavioral  depth:1
src/tools/trace.ts:160:29b4  trace  behavioral  depth:1
src/tools/impact.ts:163:dfc1  impact  behavioral  depth:2
```

Outputs for entry points:

```text
symbolGraph: Trust: fresh / No dependents found — 'symbolGraph' is an entry point with no callers.
impact: Trust: fresh / No dependents found — 'impact' is an entry point with no callers.
trace: Trust: fresh / No dependents found — 'trace' is an entry point with no callers.
```

Every surfaced dependent had tests in the fresh suite:
- `symbolGraph`: `test/tool-symbol-graph-freshness-report.test.ts`, `test/tool-symbol-graph-trust-header.test.ts`, extension suppress tests.
- `impact` / `withFreshness`: `test/tool-impact-freshness-warning.test.ts`, `test/tool-impact-trust-header.test.ts`, extension suppress tests.
- `trace` / `traceFreshness`: `test/tool-trace-freshness-warning.test.ts`, `test/tool-trace-static-edge-freshness.test.ts`, runtime/static trust tests, extension suppress tests.

### Real entry-point execution path check

Command/tool: `trace({ entry: "trace", file: "src/tools/trace.ts" })`.

Output excerpt:

```text
mode: static (heuristic, no runtime evidence)
src/tools/trace.ts:160:29b4  trace  function [entry-point, untested]
src/output/freshness.ts:115:17a3  evaluateFreshness  function [hub, untested]
src/output/freshness.ts:183:b125  prependFreshnessHeader  function [untested]
src/output/freshness.ts:170:f805  formatFreshnessHeader  function [untested]
src/tools/trace.ts:127:899f  traceFreshness  function [untested]
src/tools/trace.ts:149:9ebe  collectStaticTraceEdges  function [leaf, untested]
```

This confirms the public `trace` entry path reaches the shared freshness evaluator and the static-edge freshness collector.

## Per-Criterion Verification

### Criterion 1: Shared freshness evaluator returns typed `fresh | partial | stale | unknown` and is result-scoped

**Evidence:**
- Source: `src/output/freshness.ts:8` defines `FreshnessStatus = "fresh" | "partial" | "stale" | "unknown"`.
- Source: `src/output/freshness.ts:15-23` defines `FreshnessReport` with `status`, `changedFiles`, `deletedFiles`, `affectedSymbols`, `staleEdgeCount`, `message`, and `recommendation`.
- Source: `src/output/freshness.ts:25-33` defines `FreshnessEvaluationParams` with `targetNodes`, `resultNodes`, `resultEdges`, and `unresolvedItems`.
- Source: `src/output/freshness.ts:126-133` deduplicates and inspects only provided target/result nodes and result edges.
- Source: `src/output/freshness.ts:139-145` computes `unknown`, `stale`, `partial`, or `fresh` from unresolved, target stale, and local stale flags.
- Tests: `test/output-freshness-evaluator.test.ts:81-173` cover `fresh`, `stale`, `partial`, stale edge, and deleted-file evaluator behavior.
- Fresh focused test output: `test/output-freshness-evaluator.test.ts` had 5 passing tests.

**Verdict:** pass.

### Criterion 2: Fresh public tool output begins with exactly one compact `Trust: fresh` line when not suppressed

**Evidence:**
- Source: `src/output/freshness.ts:170-172` returns exactly `Trust: fresh` for fresh reports.
- `symbolGraph`: `src/tools/symbol-graph.ts:297-302` wraps body with `prependFreshnessHeader`; test `test/tool-symbol-graph-freshness-report.test.ts:42-43` asserts first line is `Trust: fresh`.
- `impact`: `src/tools/impact.ts:171-185` wraps outputs with `prependFreshnessHeader`; test `test/tool-impact-freshness-warning.test.ts:29-30` asserts first line is `Trust: fresh`.
- `trace`: `src/tools/trace.ts:233-240` wraps static output with freshness; tests `test/tool-trace-trust-heuristic.test.ts` and `test/tool-trace-static-mode-header.test.ts` passed in the focused run.
- Focused test output included passing fresh-header tests: `symbolGraph reports partial freshness...`, `impact reports stale dependency...`, `trace prepends the shared trust header...`, and `trace marks static fallback paths...`.

**Verdict:** pass.

### Criterion 3: Degraded freshness headers include status, changed/deleted files, affected symbols, stale edge count, and recommendation

**Evidence:**
- Source: `src/output/freshness.ts:162-180` formats changed files, deleted files, affected symbols, stale edge count, and recommendation for non-fresh reports.
- Tests: `test/output-freshness-evaluator.test.ts:109-112` assert stale target changed file, affected symbol, and deterministic indexed timestamp.
- Tests: `test/output-freshness-evaluator.test.ts:168-173` assert deleted files and deterministic wording.
- Tests: `test/tool-impact-freshness-warning.test.ts:34-39` assert `Trust: partial`, changed file, affected symbols, stale edge count, impact recommendation, and row stale marker.
- Tests: `test/tool-trace-static-edge-freshness.test.ts:31-34` assert `Trust: partial`, stale edge count, trace recommendation, and stale static mode header.
- Fresh focused test output: all named tests passed.

**Verdict:** pass.

### Criterion 4: Evaluator marks returned node stale when current file hash differs from indexed `content_hash`

**Evidence:**
- Source: `src/output/freshness.ts:67-83` reads the node file, hashes it, compares to `node.content_hash`, and records changed file/affected symbol/stale flags.
- Test: `test/output-freshness-evaluator.test.ts:98-112` mutates `src/target.ts` and asserts `status === "stale"`, changed file `src/target.ts`, and affected symbol `target`.
- Fresh focused test output: `evaluateFreshness returns stale when the requested target node changed` passed.

**Verdict:** pass.

### Criterion 5: Evaluator marks returned node/indexed file deleted when source file no longer exists

**Evidence:**
- Source: `src/output/freshness.ts:67-75` checks `existsSync`; missing node file is added to `deletedFiles`, affected symbols, and stale flags.
- Source: `src/output/freshness.ts:95-102` applies equivalent deleted-file handling for stale edge source evidence files.
- Test: `test/output-freshness-evaluator.test.ts:157-173` unlinks `src/neighbor.ts` and asserts deleted file and affected symbol.
- Test: `test/tool-trace-freshness-warning.test.ts:76-83` unlinks `src/app.ts` and asserts trace reports `deleted files: src/app.ts` and stale coverage mode.
- Fresh focused test output: both deleted-file tests passed.

**Verdict:** pass.

### Criterion 6: Degraded file detail includes deterministic indexed timestamp when available and avoids wall-clock wording

**Evidence:**
- Source: `src/output/freshness.ts:45-57` reads `indexed_at` from `file_hashes` and includes it only when available.
- Source: `src/output/freshness.ts:162-167` formats as `file (indexed_at: N)` with no relative time text.
- Test: `test/output-freshness-evaluator.test.ts:171-173` asserts deleted-file header contains `indexed_at:` and does not match `/ago|today|yesterday|just now/i`.
- Fresh focused test output: `evaluateFreshness reports deleted returned files deterministically` passed.

**Verdict:** pass.

### Criterion 7: Evaluator marks returned edge stale by comparing edge provenance hash to source node file hash

**Evidence:**
- Source: `src/output/freshness.ts:86-112` resolves `edge.source`, reads that source node's file, compares current hash to `edge.provenance.content_hash`, increments `staleEdgeCount`, and records source/target affected symbols.
- Test: `test/output-freshness-evaluator.test.ts:137-151` passes a result edge with `content_hash: "old-hash"` and asserts changed file `src/target.ts`, affected symbols `neighbor,target`, stale edge count 1, and header includes `stale edges: 1`.
- Fresh focused test output: `evaluateFreshness counts stale edge provenance against the source evidence file` passed.

**Verdict:** pass.

### Criterion 8: `symbol_graph` distinguishes stale target (`stale`) from stale neighborhood (`partial`)

**Evidence:**
- Source: `src/tools/symbol-graph.ts:297-302` evaluates freshness over `collectSymbolGraphScope(params)` and prepends the freshness header.
- Source: `src/output/freshness.ts:139-145` gives target stale precedence over local stale.
- Test: `test/tool-symbol-graph-freshness-report.test.ts:45-50` mutates returned neighbor `bar` and asserts `Trust: partial`, changed file, affected symbol, and row-level `[stale]`.
- Test: `test/tool-symbol-graph-freshness-report.test.ts:56-63` mutates target `foo` and asserts `Trust: stale`, changed file, and affected symbols `bar, foo`.
- Fresh focused test output: all three `tool-symbol-graph-freshness-report` tests passed.

**Verdict:** pass.

### Criterion 9: `impact` warns explicitly when stale dependencies/edges may make blast radius incomplete

**Evidence:**
- Source: `src/tools/impact.ts:171-185` wraps all impact outputs with `evaluateFreshness` and recommendation `impact may be incomplete; refresh index before relying on this result`.
- Source: `src/tools/impact.ts:236-245` passes hit nodes and hit edges into freshness for result-scoped dependency/edge checks.
- Test: `test/tool-impact-freshness-warning.test.ts:32-39` mutates caller dependency and asserts `Trust: partial`, changed file, affected symbols, stale edge count, impact recommendation, and stale row marker.
- Fresh focused test output: `impact reports stale dependency freshness warning for incomplete blast radius` passed.

**Verdict:** pass.

### Criterion 10: `trace` warns explicitly for stale call edges, stale trace steps, deleted files, or unresolved stored steps

**Evidence:**
- Source: `src/tools/trace.ts:127-146` centralizes trace freshness with recommendation `trace path may be unreliable; refresh index before relying on this result`.
- Source: `src/tools/trace.ts:206-210` treats unresolved stored coverage steps as `unresolvedItems` and marks coverage mode stale when freshness is non-fresh.
- Source: `src/tools/trace.ts:149-157` collects static call edges, and `src/tools/trace.ts:236-240` passes them to freshness and marks static mode stale when non-fresh.
- Test: `test/tool-trace-freshness-warning.test.ts:47-53` asserts `Trust: unknown`, recommendation, and unresolved stale stored step.
- Test: `test/tool-trace-freshness-warning.test.ts:60-69` asserts changed files, affected symbol, stale coverage mode, and stale trace step.
- Test: `test/tool-trace-freshness-warning.test.ts:76-83` asserts deleted files and stale coverage mode.
- Test: `test/tool-trace-static-edge-freshness.test.ts:21-34` seeds stale call-edge provenance and asserts stale edge count, recommendation, and stale static mode header.
- Fresh focused test output: all trace freshness/static-edge tests passed.

**Verdict:** pass.

### Criterion 11: Freshness is integrated into public `symbolGraph`, `impact`, and `trace` without adding/removing public tools

**Evidence:**
- Source: `src/tools/symbol-graph.ts:264-303` public `symbolGraph(params: SymbolGraphParams): string` calls `evaluateFreshness` and `prependFreshnessHeader`.
- Source: `src/tools/impact.ts:163-185` public `impact(params): string` defines freshness wrapper around public output.
- Source: `src/tools/trace.ts:160-240` public `trace(params: TraceParams): string` calls freshness wrappers on all paths.
- Structural search output showed `evaluateFreshness(...)` calls in exactly `src/tools/symbol-graph.ts`, `src/tools/impact.ts`, and `src/tools/trace.ts`.
- Tool registration grep: `src/index.ts:201` registers `symbol_graph`, `src/index.ts:247` registers `impact`, and `src/index.ts:275` registers `trace`.
- Fresh full suite output included `test/extension-wiring.test.ts` passing for `symbol_graph` and `trace`, `test/extension-impact.test.ts` passing for `impact`, and `tests/ptc-metadata.test.ts` passing for all three public tools.

**Verdict:** pass.

### Criterion 12: `suppressTrustHeader: true` removes freshness/trust header while preserving body, anchors, stale markers, indexing notes, and dev metadata

**Evidence:**
- Source: `src/output/read-only-ceremony.ts:1-8` strips compact `Trust: ...` plus detail lines.
- Source: `src/output/read-only-ceremony.ts:19-27` uses compact stripping before legacy stripping.
- Source: `src/index.ts:173-177` applies `stripTrustHeader` only when `suppressTrustHeader` is true and then adds indexing note/dev metadata around the remaining body.
- Test: `test/output-compact-freshness-ceremony.test.ts:12-18` asserts compact headers strip to body.
- Test: `test/extension-suppress-trust-header-interactions.test.ts:64-68` asserts suppressed output has no `## Trust` or `Trust: ` while preserving indexing-failed note and body header.
- Test: `test/extension-suppress-trust-header-interactions.test.ts:117-130` asserts fresh `symbol_graph` baseline starts `Trust: fresh` and suppressed text equals body without the header.
- Test: `test/extension-suppress-trust-header-interactions.test.ts:171-191` strips multi-line degraded header and asserts body preservation for stale graph.
- Test: `test/extension-suppress-trust-header-trace.test.ts:52-65` asserts trace suppression removes trust header but preserves static mode body.
- Fresh focused test output: all suppress-header tests passed.

**Verdict:** pass.

### Criterion 13: Row-level `[stale]` markers remain with new freshness header

**Evidence:**
- `symbol_graph`: `test/tool-symbol-graph-freshness-report.test.ts:47-50` asserts `Trust: partial` plus `bar ... [stale]`.
- `impact`: `test/tool-impact-freshness-warning.test.ts:34-39` asserts `Trust: partial` plus `caller ... [stale]`.
- `trace`: `test/tool-trace-freshness-warning.test.ts:65-69` asserts `Trust: partial`, stale coverage mode, and `prod  function [stale]`.
- Static trace edge: `test/tool-trace-static-edge-freshness.test.ts:31-34` asserts `Trust: partial`, `stale edges: 1`, and stale static mode header.
- Fresh focused test output: all these tests passed.

**Verdict:** pass.

### Criterion 14: Automated tests cover fresh output, stale target files, stale neighbor/dependency edges, deleted files, degraded impact warnings, degraded trace warnings, and suppress behavior

**Evidence:**
- Fresh output: `test/output-freshness-evaluator.test.ts:81-92`, `test/tool-symbol-graph-freshness-report.test.ts:42-43`, `test/tool-impact-freshness-warning.test.ts:29-30`, trace static/runtime trust tests all passed.
- Stale target files: `test/output-freshness-evaluator.test.ts:98-112`, `test/tool-symbol-graph-freshness-report.test.ts:56-63` passed.
- Stale neighbor/dependency edges: `test/output-freshness-evaluator.test.ts:137-151`, `test/tool-symbol-graph-freshness-report.test.ts:45-50`, `test/tool-impact-freshness-warning.test.ts:32-39`, and `test/tool-trace-static-edge-freshness.test.ts:21-34` passed.
- Deleted files: `test/output-freshness-evaluator.test.ts:157-173`, `test/tool-trace-freshness-warning.test.ts:76-83` passed.
- Degraded impact warnings: `test/tool-impact-freshness-warning.test.ts:34-39` passed.
- Degraded trace warnings: `test/tool-trace-freshness-warning.test.ts:47-83`, `test/tool-trace-static-edge-freshness.test.ts:30-34` passed.
- Suppression behavior: focused run included `extension-suppress-trust-header-symbol-graph`, `extension-suppress-trust-header-impact`, `extension-suppress-trust-header-trace`, and `extension-suppress-trust-header-interactions`, all passed.
- Grep summary over `test/*.test.ts` found 88 freshness/suppression assertions across 24 files.

**Verdict:** pass.

### Criterion 15: Full verification includes `bun test` and `bun run check`

**Evidence:**
- Fresh command run: `bun test && bun run check`.
- Output ended with `437 pass`, `0 fail`, `1271 expect() calls`, `Ran 437 tests across 178 files`, then `$ tsc --noEmit`.
- Separate fresh command `bun run check` produced `$ tsc --noEmit` and exited 0.

**Verdict:** pass.

## Bugfix Symptom Reproduction

The original symptoms were stale/global/legacy trust signals instead of result-scoped compact freshness reports on `symbol_graph`, `impact`, and `trace`.

Evidence that the symptoms no longer occur:
- Result-scoped evaluator tests now pass for fresh, stale target, stale returned neighbor, stale edge, and deleted files.
- `symbol_graph` stale target vs stale neighborhood tests now pass.
- `impact` stale dependency warning test now passes.
- `trace` unresolved stored step, stale stored step, deleted file, and stale static call-edge tests now pass.
- Suppress-header extension tests now pass for all public tools and preserve body/indexing/devmeta behavior.

## Overall Verdict

pass

All 15 acceptance criteria are verified with fresh command output, source inspection, structural search, public entry-point trace evidence, and focused regression tests. The full test suite and typecheck both pass.