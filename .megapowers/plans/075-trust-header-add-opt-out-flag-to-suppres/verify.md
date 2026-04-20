# Verify — Issue 075: Trust header opt-out flag

## Environment / Test Runner
`AGENTS.md` documents the project runtime as Bun + TypeScript:

```text
67|- Bun runtime, TypeScript
68|- tree-sitter and ast-grep are already in the pi stack
69|- LSP is spawned as child process (tsserver), not a library dep
```

Verification therefore used `bun test` for the suite and `bun test <file>` for targeted regressions.

## Test Suite Results

### Full suite (fresh run)
Command:

```text
$ bun test
```

Observed output excerpt:

```text
test/output-strip-trust-header.test.ts:
(pass) stripTrustHeader removes trust header regardless of status
(pass) stripTrustHeader strips the trace mode line that follows the trust header when present
(pass) stripTrustHeader returns input unchanged when no trust header is present
(pass) stripTrustHeader is idempotent
(pass) stripTrustHeader does not strip a partial/malformed trust block

...

test/extension-suppress-trust-header-trace.test.ts:
(pass) trace schema advertises suppressTrustHeader as an optional boolean
(pass) trace with suppressTrustHeader:true omits the non-fresh Trust header

...

test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB
(pass) suppressTrustHeader:true still appends _meta footer when CODEGRAPH_DEVMETA=1
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph)
(pass) suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh)

...

test/extension-suppress-trust-header-impact.test.ts:
(pass) impact schema advertises suppressTrustHeader as an optional boolean
(pass) impact with suppressTrustHeader:true omits the Trust header on a stale graph

...

test/extension-suppress-trust-header-symbol-graph.test.ts:
(pass) symbol_graph schema advertises suppressTrustHeader as an optional boolean
(pass) symbol_graph with suppressTrustHeader:true omits the Trust header on a stale graph

 401 pass
 0 fail
 1168 expect() calls
Ran 401 tests across 162 files. [13.14s]
```

Verdict: full suite passed, exit 0.

### Targeted regression files (fresh run)
Command:

```text
$ bun test test/output-strip-trust-header.test.ts \
  && bun test test/extension-suppress-trust-header-symbol-graph.test.ts \
  && bun test test/extension-suppress-trust-header-impact.test.ts \
  && bun test test/extension-suppress-trust-header-trace.test.ts \
  && bun test test/extension-suppress-trust-header-interactions.test.ts
```

Observed output excerpt:

```text
test/output-strip-trust-header.test.ts:
(pass) stripTrustHeader removes trust header regardless of status
(pass) stripTrustHeader strips the trace mode line that follows the trust header when present
(pass) stripTrustHeader returns input unchanged when no trust header is present
(pass) stripTrustHeader is idempotent
(pass) stripTrustHeader does not strip a partial/malformed trust block

 5 pass
 0 fail

---

test/extension-suppress-trust-header-symbol-graph.test.ts:
(pass) symbol_graph schema advertises suppressTrustHeader as an optional boolean
(pass) symbol_graph with suppressTrustHeader:true omits the Trust header on a stale graph

 2 pass
 0 fail

---

test/extension-suppress-trust-header-impact.test.ts:
(pass) impact schema advertises suppressTrustHeader as an optional boolean
(pass) impact with suppressTrustHeader:true omits the Trust header on a stale graph

 2 pass
 0 fail

---

test/extension-suppress-trust-header-trace.test.ts:
(pass) trace schema advertises suppressTrustHeader as an optional boolean
(pass) trace with suppressTrustHeader:true omits the non-fresh Trust header

 2 pass
 0 fail

---

test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB
(pass) suppressTrustHeader:true still appends _meta footer when CODEGRAPH_DEVMETA=1
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph)
(pass) suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh)

 5 pass
 0 fail
```

Verdict: targeted regressions passed, exit 0.

### Downstream impact coverage check
Primary changed symbol used for dependency analysis: `finalizeReadOnlyOutput`.

Command:

```text
impact({ symbols: ["finalizeReadOnlyOutput"], changeType: "behavior_change", suppressTrustHeader: true })
```

Observed output:

```text
indexing-failed (0s ago): Bun is not defined
src/index.ts:199:07cd  piCodegraph  behavioral  depth:1  [fan-in:4, fan-out:10, roles:hub, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-suppress-trust-header-impact.test.ts:9:dbc0  register  behavioral  depth:2  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-suppress-trust-header-interactions.test.ts:10:dbc0  register  behavioral  depth:2  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-suppress-trust-header-symbol-graph.test.ts:9:dbc0  register  behavioral  depth:2  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-suppress-trust-header-trace.test.ts:8:dbc0  register  behavioral  depth:2  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

Each surfaced `register` helper calls `piCodegraph(mockPi)`:

```text
extension-suppress-trust-header-impact.test.ts:   16|  resetStoreForTesting();
extension-suppress-trust-header-impact.test.ts:>> 17|  piCodegraph(mockPi);
extension-suppress-trust-header-impact.test.ts:   18|  return tools;

extension-suppress-trust-header-symbol-graph.test.ts:   16|  resetStoreForTesting();
extension-suppress-trust-header-symbol-graph.test.ts:>> 17|  piCodegraph(mockPi);
extension-suppress-trust-header-symbol-graph.test.ts:   18|  return tools;

extension-suppress-trust-header-trace.test.ts:   15|  resetStoreForTesting();
extension-suppress-trust-header-trace.test.ts:>> 16|  piCodegraph(mockPi);
extension-suppress-trust-header-trace.test.ts:   17|  return tools;

extension-suppress-trust-header-interactions.test.ts:   17|  resetStoreForTesting();
extension-suppress-trust-header-interactions.test.ts:>> 18|  piCodegraph(mockPi);
extension-suppress-trust-header-interactions.test.ts:   19|  return tools;
```

Those four files all ran in both the targeted regression run and the full suite. Therefore every surfaced dependent from `impact(...)` had a test run, and `piCodegraph` itself was exercised through those helpers.

## Bug Reproduction (original symptom no longer occurs)
Diagnosis to reproduce: call `symbol_graph` with `suppressTrustHeader: true` against a non-fresh/stale graph and verify the output does **not** contain the `## Trust` block.

Command run in-session: `bun -e '<script that seeds a stale readonly DB and executes symbol_graph with suppressTrustHeader:true>'`

Observed output:

```text
indexing-failed (0s ago): readonly database
## foo (function)
src/app.ts:2:6726

### Signature
()

### Signals
[entry-point, leaf, untested]
```

Verification:
- first non-empty line is `indexing-failed ...`, not `## Trust`
- there is no `## Trust` block anywhere in the output
- the symbol body still renders

Verdict: the original symptom does not reproduce.

## Per-Criterion Verification

### Criterion 1
> Each of the three read-only tool parameter schemas in `src/index.ts` (`SymbolGraphParams`, `ImpactParams`, `TraceParams`) includes an optional boolean field named `suppressTrustHeader` with a human-readable description indicating it skips the Trust header.

**Evidence**

Code inspection (`src/index.ts:17-78`):

```text
17|const SymbolGraphParams = Type.Object({
...
33|  suppressTrustHeader: Type.Optional(
34|    Type.Boolean({
35|      description:
36|        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
37|    }),
38|  ),
39|});

42|const ImpactParams = Type.Object({
...
61|  suppressTrustHeader: Type.Optional(
62|    Type.Boolean({
63|      description:
64|        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
65|    }),
66|  ),
67|});

69|const TraceParams = Type.Object({
70|  entry: Type.String({ description: "Entry symbol or endpoint name" }),
71|  file: Type.Optional(Type.String({ description: "File path to disambiguate" })),
72|  suppressTrustHeader: Type.Optional(
73|    Type.Boolean({
74|      description:
75|        "When true, omit the ## Trust header from tool output. Useful after the first call in a multi-call session.",
76|    }),
77|  ),
78|});
```

Structural search also matched all three schema objects with `suppressTrustHeader: Type.Optional(Type.Boolean(...))`.

**Verdict:** pass

### Criterion 2
> The pi tool schema exposed to callers for `symbol_graph`, `impact`, and `trace` advertises `suppressTrustHeader` as an optional boolean parameter, so callers can discover it from the JSON schema.

**Evidence**

Registration source shows the tools expose those schemas directly:

```text
199|export default function piCodegraph(pi: ExtensionAPI): void {
200|  registerReadOnlyTool(pi, {
201|    name: "symbol_graph",
204|    parameters: SymbolGraphParams,
...
246|  registerReadOnlyTool(pi, {
247|    name: "impact",
250|    parameters: ImpactParams,
...
274|  registerReadOnlyTool(pi, {
275|    name: "trace",
279|    parameters: TraceParams,
```

Runtime schema checks passed for all three tools:

```text
test/extension-suppress-trust-header-symbol-graph.test.ts:
(pass) symbol_graph schema advertises suppressTrustHeader as an optional boolean

test/extension-suppress-trust-header-impact.test.ts:
(pass) impact schema advertises suppressTrustHeader as an optional boolean

test/extension-suppress-trust-header-trace.test.ts:
(pass) trace schema advertises suppressTrustHeader as an optional boolean
```

**Verdict:** pass

### Criterion 3
> Calling `symbol_graph` with `suppressTrustHeader: true` against a non-fresh graph returns output whose first non-empty line is not `## Trust`, and contains no `## Trust` header block.

**Evidence**

Direct reproduction output on a stale readonly DB:

```text
indexing-failed (0s ago): readonly database
## foo (function)
src/app.ts:2:6726

### Signature
()

### Signals
[entry-point, leaf, untested]
```

And the regression test passed:

```text
test/extension-suppress-trust-header-symbol-graph.test.ts:
(pass) symbol_graph with suppressTrustHeader:true omits the Trust header on a stale graph
```

**Verdict:** pass

### Criterion 4
> Calling `impact` with `suppressTrustHeader: true` against a non-fresh graph returns output with no `## Trust` header block.

**Evidence**

Regression test passed:

```text
test/extension-suppress-trust-header-impact.test.ts:
(pass) impact with suppressTrustHeader:true omits the Trust header on a stale graph
```

**Verdict:** pass

### Criterion 5
> Calling `trace` with `suppressTrustHeader: true` against a non-fresh graph returns output with no `## Trust` header block.

**Evidence**

Regression test passed:

```text
test/extension-suppress-trust-header-trace.test.ts:
(pass) trace with suppressTrustHeader:true omits the non-fresh Trust header
```

Additional runtime example from the tool itself:

```text
mode: static (heuristic, no runtime evidence)
src/index.ts:165:654d  finalizeReadOnlyOutput  function [untested]
src/index.ts:161:b40c  indexingFailedNote  function [untested]
src/index.ts:102:41a1  getIndexingFailedNoteForTesting  function [leaf, untested]
src/output/read-only-ceremony.ts:1:e12b  suppressFreshTrustHeader  function [leaf, untested]
src/output/read-only-ceremony.ts:10:dbb3  stripTrustHeader  function [leaf, untested]
```

That trace output starts with `mode: ...`, not `## Trust`.

**Verdict:** pass

### Criterion 6
> Calling any of the three tools with `suppressTrustHeader: true` against a fresh graph returns output with no `## Trust` header block.

**Evidence**

Direct fresh-graph verification script output:

```text
symbol_graph_has_trust=false
impact_has_trust=false
trace_has_trust=false
--- symbol_graph ---
## foo (function)
src/app.ts:2:6726

### Signature
()

--- impact ---
No dependents found — 'shared' is an entry point with no callers.

--- trace ---
mode: static (heuristic, no runtime evidence)
src/app.ts:2:6726  foo  function [entry-point, leaf, untested]
```

The explicit fresh-path regression also passed for `symbol_graph`:

```text
test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)
```

**Verdict:** pass

### Criterion 7
> Calling any of the three tools with `suppressTrustHeader` absent, `undefined`, or `false` produces output byte-identical to the pre-change baseline for both fresh graphs and non-fresh graphs.

**Evidence**

Direct runtime comparison (`omitted` vs `false`):

```text
symbol_graph_omitted_eq_false=true
impact_omitted_eq_false=true
trace_omitted_eq_false=true
trace_baseline_starts_with_trust=true
```

The call sites all use strict equality to `true`, so `absent`, `undefined`, and `false` all take the same baseline branch:

```text
233|      const output = finalizeReadOnlyOutput(
...
239|        params.suppressTrustHeader === true,
...
262|      const output = finalizeReadOnlyOutput(
...
268|        params.suppressTrustHeader === true,
...
285|      const output = finalizeReadOnlyOutput(
...
291|        params.suppressTrustHeader === true,
```

The non-fresh trace equivalence regression also passed:

```text
test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:false is byte-identical to omitting the flag (trace, non-fresh)
```

**Verdict:** pass

### Criterion 8
> A single helper in `src/output/read-only-ceremony.ts` removes a complete `## Trust` header block from the head of a string, and returns its input unchanged when the head does not match that shape.

**Evidence**

`stripTrustHeader` source:

```text
10|export function stripTrustHeader(text: string): string {
11|  const lines = text.split("\n");
12|  if (lines.length < 3) return text;
13|  if (lines[0] !== "## Trust") return text;
14|  if (!(lines[1] ?? "").startsWith("status: ")) return text;
15|  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
16|  return lines.slice(3).join("\n");
17|}
```

Regression tests passed for the helper contract:

```text
test/output-strip-trust-header.test.ts:
(pass) stripTrustHeader removes trust header regardless of status
(pass) stripTrustHeader strips the trace mode line that follows the trust header when present
(pass) stripTrustHeader returns input unchanged when no trust header is present
(pass) stripTrustHeader does not strip a partial/malformed trust block
```

**Verdict:** pass

### Criterion 9
> `stripTrustHeader` is idempotent.

**Evidence**

```text
test/output-strip-trust-header.test.ts:
(pass) stripTrustHeader is idempotent
```

**Verdict:** pass

### Criterion 10
> All trust-header suppression happens inside `finalizeReadOnlyOutput`; individual tool functions do not read the new flag directly.

**Evidence**

Centralized suppression is in `finalizeReadOnlyOutput`:

```text
165|function finalizeReadOnlyOutput(
166|  toolName: string,
167|  params: Record<string, unknown>,
168|  toolOutput: string,
169|  store: GraphStore,
170|  projectRoot: string,
171|  suppressTrustHeader: boolean = false,
172|): string {
173|  const afterFreshStrip = suppressFreshTrustHeader(toolOutput);
174|  const afterHeaderStrip = suppressTrustHeader ? stripTrustHeader(afterFreshStrip) : afterFreshStrip;
177|  const withIndexingNote = indexingFailedNote() + afterHeaderStrip;
185|  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
186|}
```

All three registered tools only forward the boolean into `finalizeReadOnlyOutput`:

```text
233|      const output = finalizeReadOnlyOutput(
239|        params.suppressTrustHeader === true,
...
262|      const output = finalizeReadOnlyOutput(
268|        params.suppressTrustHeader === true,
...
285|      const output = finalizeReadOnlyOutput(
291|        params.suppressTrustHeader === true,
```

No tool implementation under `src/tools/` reads the flag directly:

```text
grep summary for "suppressTrustHeader" in src/tools => [0 matches in 0 files]
```

Execution path check for the changed logic:

```text
mode: static (heuristic, no runtime evidence)
src/index.ts:165:654d  finalizeReadOnlyOutput  function [untested]
src/output/read-only-ceremony.ts:1:e12b  suppressFreshTrustHeader  function [leaf, untested]
src/output/read-only-ceremony.ts:10:dbb3  stripTrustHeader  function [leaf, untested]
src/tools/token-tracker.ts:134:7e58  appendTokenMetaIfEnabled  function [untested]
```

**Verdict:** pass

### Criterion 11
> The `suppressTrustHeader` flag does not affect `_meta: tokens_saved` output when `CODEGRAPH_DEVMETA=1` is set.

**Evidence**

Regression test passed:

```text
test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true still appends _meta footer when CODEGRAPH_DEVMETA=1
```

And `finalizeReadOnlyOutput` appends dev meta after header stripping:

```text
185|  return appendTokenMetaIfEnabled(toolName, params, withIndexingNote, store, projectRoot);
```

**Verdict:** pass

### Criterion 12
> The `suppressTrustHeader` flag does not affect the `indexing-failed (<N>s ago): ...` note emitted by `finalizeReadOnlyOutput` when `lastIndexError` is set.

**Evidence**

Regression test passed:

```text
test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true still renders the indexing-failed note on a readonly stale DB
```

Direct reproduction output also shows the note is still prepended:

```text
indexing-failed (0s ago): readonly database
## foo (function)
...
```

Source confirms the note is prepended after header stripping:

```text
177|  const withIndexingNote = indexingFailedNote() + afterHeaderStrip;
```

**Verdict:** pass

### Criterion 13
> The `suppressTrustHeader` flag does not alter anchors, edge provenance labels, signal badges, or any non-Trust body content.

**Evidence**

Regression tests passed:

```text
test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (stale graph)
```

The direct stale reproduction still includes anchor + body + signals with no Trust block removed incorrectly:

```text
## foo (function)
src/app.ts:2:6726

### Signature
()

### Signals
[entry-point, leaf, untested]
```

The stale-body test is byte-for-byte on the baseline output with only the 3-line Trust block removed; the remaining content is preserved.

**Verdict:** pass

### Criterion 14
> Default behavior of `suppressFreshTrustHeader` is unchanged: it continues to strip the Trust header only when `status: fresh`, and is still invoked unconditionally in `finalizeReadOnlyOutput`.

**Evidence**

`src/output/read-only-ceremony.ts` is unchanged in its fresh-only guard:

```text
1|export function suppressFreshTrustHeader(text: string): string {
2|  const lines = text.split("\n");
3|  if (lines.length < 3) return text;
4|  if (lines[0] !== "## Trust") return text;
5|  if (lines[1] !== "status: fresh") return text;
6|  if (!(lines[2] ?? "").startsWith("evidence: ")) return text;
7|  return lines.slice(3).join("\n");
8|}
```

`finalizeReadOnlyOutput` still invokes it unconditionally before optional suppression:

```text
173|  const afterFreshStrip = suppressFreshTrustHeader(toolOutput);
174|  const afterHeaderStrip = suppressTrustHeader ? stripTrustHeader(afterFreshStrip) : afterFreshStrip;
```

Regression tests passed:

```text
test/output-readonly-ceremony.test.ts:
(pass) suppressFreshTrustHeader strips only fresh trust headers

test/extension-suppress-trust-header-interactions.test.ts:
(pass) suppressTrustHeader:true preserves body anchors and signals on symbol_graph (fresh graph)
```

**Verdict:** pass

## Overall Verdict
**pass**

All 14 acceptance criteria are met.

Evidence summary:
- fresh full-suite run: `401 pass, 0 fail`
- targeted regression runs: all 5 trust-header-related files passed
- direct bug reproduction no longer shows the `## Trust` block when `suppressTrustHeader: true` is used on a stale graph
- code inspection confirms the implementation is centralized in `finalizeReadOnlyOutput`, the helper exists and is idempotent, and the flag is exposed in all three registered tool schemas
