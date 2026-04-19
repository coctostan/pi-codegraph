## Test Suite Results

Command run fresh:

```bash
bun test
```

Relevant output excerpt:

```text
test/extension-devmode-tools.test.ts:
(pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes [0.10ms]
(pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value [0.15ms]
(pass) graph_query keeps its existing runtime behavior when dev mode is enabled [33.46ms]

test/extension-readonly-trust-gating.test.ts:
(pass) fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines [220.53ms]
(pass) non-fresh trace tool calls still render the Trust header [128.34ms]
(pass) readonly reindex output still renders the indexing-failed note [14.10ms]
(pass) readonly reindex output still renders the indexing-failed note when the db directory blocks journal writes [16.35ms]

test/extension-impact.test.ts:
(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [0.92ms]
(pass) impact() emits anchored structured lines and empty string for no-impact [1.16ms]
(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.12ms]

test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error with example when symbols is empty array [0.86ms]
(pass) impact() returns Trust-header-wrapped error when symbols is undefined [0.44ms]
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.70ms]
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [0.55ms]
(pass) collectImpact() returns [] when symbols is empty array [0.37ms]

test/tool-impact.test.ts:
(pass) collectImpact classifies direct and transitive dependents by change type [1.24ms]
(pass) collectImpact respects maxDepth [0.39ms]
(pass) collectImpact returns no dependents for addition [0.20ms]
(pass) collectImpact terminates on cycles without duplicates [0.46ms]
(pass) collectImpact terminates on a 3-node cycle without duplicates [0.84ms]
(pass) collectImpact classification matrix (AC 34) across all change types [0.58ms]

test/tool-impact-empty-output.test.ts:
(pass) impact() returns diagnostic message for non-existent symbol (#042) [1.09ms]
(pass) impact() returns diagnostic message for addition change type (#043) [0.80ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.56ms]

test/tool-impact-ranking.test.ts:
(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.00ms]
(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.59ms]

test/tool-impact-performance.test.ts:
(pass) impact renders 120 annotated dependents under one second [18.32ms]

test/tool-impact-trust-header.test.ts:
(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [2.01ms]

test/tool-impact-ambiguous.test.ts:
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [2.00ms]

449 pass
0 fail
1357 expect() calls
Ran 449 tests across 188 files. [9.94s]
```

Changed-symbol downstream dependents, per tool output:

Command:

```text
impact({ symbols:["collectImpactDetails"], changeType:"behavior_change", maxDepth:5 })
```

Output:

```text
src/index.ts:176:07cd  piCodegraph  behavioral  depth:2  [fan-in:2, fan-out:16, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:132:dfc1  impact  behavioral  depth:1  [fan-in:1, fan-out:6, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:122:0e1d  collectImpact  behavioral  depth:1  [fan-in:0, fan-out:1, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-devmode-tools.test.ts:24:06a6  registerTools  behavioral  depth:3  [fan-in:0, fan-out:3, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-readonly-trust-gating.test.ts:9:8932  registerTools  behavioral  depth:3  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

Test coverage cross-check for those dependents:
- `piCodegraph`: exercised in `test/extension-impact.test.ts`, `test/extension-devmode-tools.test.ts`, `test/extension-readonly-trust-gating.test.ts` and other extension wiring tests; those files all appeared in the fresh `bun test` run.
- `impact` / `collectImpact`: exercised in `test/tool-impact*.test.ts` and `test/extension-impact.test.ts`; those files all appeared in the fresh `bun test` run.
- Both surfaced `registerTools` helper sites are the two test files above; both ran in the fresh `bun test` run.

Trace from the feature entry path used for verification:

Command:

```text
trace({ entry:"impact", file:"src/tools/impact.ts" })
```

Output:

```text
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/225
mode: static (heuristic, no runtime evidence)
src/tools/impact.ts:132:dfc1  impact  function [untested]
src/output/anchoring.ts:17:0d83  computeAnchor  function [untested]
src/output/signals.ts:48:59f5  createSignalComputer  function [hub, untested]
src/output/signals.ts:175:8ce1  formatImpactWhy  function [untested]
src/output/trust.ts:48:ed81  prependTrustHeader  function [untested]
src/tools/impact.ts:66:3526  collectImpactDetails  function [untested]
src/tools/impact.ts:36:a4c8  classify  function [leaf, untested]
src/tools/impact.ts:45:7f92  dedupeInboundByStrongestEdge  function [leaf, untested]
src/tools/symbol-resolution.ts:20:a0c9  resolveUniqueSymbol  function [untested]
```

## Per-Criterion Verification

### Criterion 1: Case A (empty array, tool entry)
**Claim:** `impact({ symbols: [], changeType: "behavior_change", store, projectRoot })` returns Trust header + `symbols` required diagnostic + minimal example.

**Evidence:**

Reproduction command:

```bash
bun .megapowers/plans/065-impact-empty-symbols-and-invalid-changet/repro-065-verify.ts
```

Relevant output:

```text
=== impact({ symbols: [], changeType: 'behavior_change' }) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
```

Source evidence:

```text
src/tools/impact.ts
141:48b|  if (!params.symbols || params.symbols.length === 0) {
142:e16|    return prependTrustHeader(
143:0d1|      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
144:900|      { stats },
145:82c|    );
```

Symbol graph card:

```text
## impact (function)
src/tools/impact.ts:132:dfc1 [untested]
### Guards / Preconditions
  - !params.symbols || params.symbols.length === 0
  - !validChangeTypes.includes(params.changeType)
  - resolved.kind === "ambiguous"
  - resolved.kind === "not_found"
  - params.changeType === "addition"
  - hits.length === 0
  - !node
```

**Verdict:** pass

### Criterion 2: Case B / C (empty or undefined, internal function)
**Claim:** `collectImpact({ symbols: [], ... })` and `collectImpact({ symbols: undefined, ... })` do not throw the raw `TypeError`.

**Evidence:**

Reproduction output:

```text
=== collectImpact({ symbols: [] }) ===
[]
---
=== collectImpact({ symbols: undefined }) ===
[]
```

Source evidence:

```text
src/tools/impact.ts
67:a09|  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
68:0aa|  if (changeType === "addition") return [];
69:b66|  if (!symbols || symbols.length === 0) return [];
```

Symbol graph card:

```text
## collectImpactDetails (function)
src/tools/impact.ts:66:3526 [untested]
### Guards / Preconditions
  - changeType === "addition"
  - !symbols || symbols.length === 0
```

**Verdict:** pass

### Criterion 3: Case D / E (invalid `changeType`, internal function)
**Claim:** invalid `changeType` is rejected at the internal function layer, not just the tool wrapper.

**Evidence:**

Fresh reproduction output:

```text
=== collectImpact invalid changeType ===
[]
---
=== impact(valid symbol, invalid changeType) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nchangeType: invalid value \"typo_change\" — must be one of: signature_change, removal, behavior_change, addition\n"
```

Direct seeded internal-call check with a resolvable symbol and a dependent:

```bash
bun -e 'import { SqliteGraphStore } from "./src/graph/sqlite.js"; import { collectImpact } from "./src/tools/impact.js"; const store = new SqliteGraphStore(); try { store.addNode({ id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" }); store.addNode({ id: "src/a.ts::a:1", kind: "function", name: "a", file: "src/a.ts", start_line: 1, end_line: 1, content_hash: "h" }); store.addEdge({ source: "src/a.ts::a:1", target: "src/lib.ts::shared:1", kind: "calls", provenance: { source: "tree-sitter", confidence: 0.5, evidence: "call", content_hash: "hash" }, created_at: 1 }); console.log(JSON.stringify(collectImpact({ symbols: ["shared"], changeType: "typo_change", store, maxDepth: 5 }))); } finally { store.close(); }'
```

Output:

```text
[]
```

Source evidence showing the validation gap:

```text
src/tools/impact.ts
104:688|      const classification = classify(changeType, depth);
105:151|      if (!classification) continue;
```

```text
src/tools/impact.ts
36:df2|function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
37:4c4|  if (changeType === "addition") return null;
38:d2f|  if (changeType === "behavior_change") return "behavioral";
39:280|  if (changeType === "signature_change" || changeType === "removal") {
40:b35|    return depth === 1 ? "breaking" : "behavioral";
41:b18|  }
42:356|  return null;
43:b18|}
```

```text
src/tools/impact.ts
148:b0a|  const validChangeTypes: readonly ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
149:2a5|  if (!validChangeTypes.includes(params.changeType)) {
```

`collectImpactDetails` contract from `symbol_graph` lists only these guards:

```text
### Guards / Preconditions
  - changeType === "addition"
  - !symbols || symbols.length === 0
```

There is no internal invalid-`changeType` guard in `collectImpactDetails` or `collectImpact`.

Regression-test coverage check for this missing case:

```text
grep("collectImpact\(\{ symbols: \[\"shared\"\], changeType: \"typo_change\"", path:"test", glob:"**/*.test.ts", summary:true)
=> [0 matches in 0 files]
```

**Verdict:** fail

### Criterion 4: Existing `impact` test files still pass
**Claim:** all existing `impact`-related test files still pass.

**Evidence:**

Fresh `bun test` output includes all requested files as passing:

```text
test/tool-impact.test.ts: PASS (6 tests)
test/tool-impact-ambiguous.test.ts: PASS (1 test)
test/tool-impact-empty-output.test.ts: PASS (2 tests)
test/tool-impact-output-signals.test.ts: PASS (1 test)
test/tool-impact-performance.test.ts: PASS (1 test)
test/tool-impact-ranking.test.ts: PASS (2 tests)
test/tool-impact-trust-header.test.ts: PASS (1 test)
test/extension-impact.test.ts: PASS (3 tests)

449 pass
0 fail
```

**Verdict:** pass

### Criterion 5: New regression test file lands green with the required cases
**Claim:** `test/tool-impact-empty-symbols.test.ts` exists and passes.

**Evidence:**

Fresh suite output:

```text
test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error with example when symbols is empty array [0.86ms]
(pass) impact() returns Trust-header-wrapped error when symbols is undefined [0.44ms]
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.70ms]
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [0.55ms]
(pass) collectImpact() returns [] when symbols is empty array [0.37ms]
```

Source coverage in the file:

```text
26:fa6|test("impact() returns Trust-header-wrapped error with example when symbols is empty array", () => {
47:bf7|test("impact() returns Trust-header-wrapped error when symbols is undefined", () => {
66:156|test("impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid", () => {
89:aea|test("collectImpact() returns [] (not a throw) when symbols is undefined", () => {
105:32f|test("collectImpact() returns [] when symbols is empty array", () => {
```

**Verdict:** pass

### Criterion 6: Empty-symbols error includes a minimal example
**Claim:** the empty-symbols diagnostic includes a minimal invocation example.

**Evidence:**

Reproduction output:

```text
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
```

Source evidence:

```text
143:0d1|      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
```

**Verdict:** pass

## Overall Verdict

fail

Summary:
- The public `impact()` tool path is fixed for empty `symbols` and invalid `changeType`.
- The internal empty/undefined `symbols` path no longer throws a raw `TypeError`; it returns `[]`.
- The internal invalid-`changeType` path is still broken. `collectImpact()` and `collectImpactDetails()` still accept `"typo_change"` and silently return `[]` instead of surfacing a diagnostic listing valid literals.

Recommended next step:
- Return to implement and add runtime `changeType` validation in the internal layer (`collectImpactDetails` or `collectImpact`) plus a regression test that exercises `collectImpact({ symbols:["shared"], changeType:"typo_change" as any, ... })` with a resolvable symbol.
