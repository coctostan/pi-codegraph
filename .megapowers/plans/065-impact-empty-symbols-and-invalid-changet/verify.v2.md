## Test Suite Results

### Project conventions checked
- `AGENTS.md:67-69` documents the project runtime and language:
```text
67:cb4|- Bun runtime, TypeScript
68:a7e|- tree-sitter and ast-grep are already in the pi stack
69:8d2|- LSP is spawned as child process (tsserver), not a library dep
```

### Full suite run (fresh)
Command: `bun test`

Relevant output from this run:
```text
test/tool-impact-trust-header.test.ts:
(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [3.88ms]

...

test/extension-devmode-tools.test.ts:
(pass) piCodegraph hides dev-only tools by default and does not re-register them after env changes [0.23ms]
(pass) piCodegraph registers the dev-only tools for every approved CODEGRAPH_DEVMODE truthy value [0.15ms]
(pass) graph_query keeps its existing runtime behavior when dev mode is enabled [33.06ms]

test/extension-readonly-trust-gating.test.ts:
(pass) fresh symbol_graph tool calls omit the Trust header but keep provenance and signal lines [246.76ms]
(pass) non-fresh trace tool calls still render the Trust header [133.76ms]
(pass) readonly reindex output still renders the indexing-failed note [14.79ms]
(pass) readonly reindex output still renders the indexing-failed note when the db directory blocks journal writes [13.85ms]

...

test/extension-impact.test.ts:
(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [1.20ms]
(pass) impact() emits anchored structured lines and empty string for no-impact [1.36ms]
(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.20ms]

...

test/tool-impact-ranking.test.ts:
(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.02ms]
(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.76ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.38ms]

test/tool-impact-ambiguous.test.ts:
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [1.94ms]

test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error with example when symbols is empty array [0.88ms]
(pass) impact() returns Trust-header-wrapped error when symbols is undefined [0.40ms]
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.83ms]
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [0.59ms]
(pass) collectImpact() returns [] when symbols is empty array [0.43ms]

test/tool-impact-performance.test.ts:
(pass) impact renders 120 annotated dependents under one second [19.60ms]

test/tool-impact-empty-output.test.ts:
(pass) impact() returns diagnostic message for non-existent symbol (#042) [1.32ms]
(pass) impact() returns diagnostic message for addition change type (#043) [0.77ms]

test/tool-impact.test.ts:
(pass) collectImpact classifies direct and transitive dependents by change type [1.18ms]
(pass) collectImpact respects maxDepth [0.35ms]
(pass) collectImpact returns no dependents for addition [0.26ms]
(pass) collectImpact terminates on cycles without duplicates [0.53ms]
(pass) collectImpact terminates on a 3-node cycle without duplicates [0.81ms]
(pass) collectImpact classification matrix (AC 34) across all change types [0.66ms]

 449 pass
 0 fail
 1357 expect() calls
Ran 449 tests across 188 files. [13.38s]
```

Supplemental typecheck run:
- Command: `bun run check; printf 'EXIT:%s\n' $?`
- Output:
```text
$ tsc --noEmit
EXIT:0
```

### Downstream dependents of the primary changed symbol
Primary changed symbol checked: `collectImpactDetails`

Command: `impact({ symbols: ["collectImpactDetails"], changeType: "signature_change", maxDepth: 5 })`

Output:
```text
src/tools/impact.ts:132:dfc1  impact  breaking  depth:1  [fan-in:1, fan-out:6, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:122:0e1d  collectImpact  breaking  depth:1  [fan-in:0, fan-out:1, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/index.ts:176:07cd  piCodegraph  behavioral  depth:2  [fan-in:2, fan-out:16, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-devmode-tools.test.ts:24:06a6  registerTools  behavioral  depth:3  [fan-in:0, fan-out:3, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
test/extension-readonly-trust-gating.test.ts:9:8932  registerTools  behavioral  depth:3  [fan-in:0, fan-out:2, roles:none, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

Coverage confirmation for surfaced dependents:
- `grep("collectImpact\\(", path:"test", summary:true)`:
```text
[13 matches in 2 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact.test.ts: 9 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-symbols.test.ts: 4 matches
```
- `grep("impact\\(", path:"test", summary:true)`:
```text
[20 matches in 8 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-symbols.test.ts: 7 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-output.test.ts: 4 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-impact.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-trust-header.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/token-tracker-all-tools.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-output-signals.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-ambiguous.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-performance.test.ts: 1 matches
```
- `grep("registerTools", path:"test", summary:true)`:
```text
[10 matches in 3 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-readonly-trust-gating.test.ts: 5 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-devmode-tools.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-readonly-devmeta.test.ts: 2 matches
```

Those files all appeared in the fresh `bun test` run above.

### Trace from the real entry point
Command: `trace({ entry: "impact", file: "src/tools/impact.ts" })`

Output:
```text
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/225
mode: static (heuristic, no runtime evidence)
src/tools/impact.ts:132:dfc1  impact  function [untested]
...
src/tools/impact.ts:66:3526  collectImpactDetails  function [untested]
...
src/tools/symbol-resolution.ts:20:a0c9  resolveUniqueSymbol  function [untested]
```

This confirms the modified `collectImpactDetails` helper is on the executed `impact` path.

## Reproduction Results

### Original bug reproduction command
Command: `bun .megapowers/plans/065-impact-empty-symbols-and-invalid-changet/repro-065-verify.ts`

Output:
```text
=== impact({ symbols: [], changeType: 'behavior_change' }) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
---
=== collectImpact({ symbols: [] }) ===
[]
---
=== collectImpact({ symbols: undefined }) ===
[]
---
=== collectImpact invalid changeType ===
[]
---
=== impact(valid symbol, invalid changeType) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nchangeType: invalid value \"typo_change\" — must be one of: signature_change, removal, behavior_change, addition\n"
```

### Direct internal-function invalid-`changeType` check with a resolvable symbol
Command:
`bun --eval 'import { SqliteGraphStore } from "./src/graph/sqlite.js"; import { collectImpact } from "./src/tools/impact.js"; const store = new SqliteGraphStore(); try { store.addNode({ id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" }); console.log(JSON.stringify(collectImpact({ symbols: ["shared"], changeType: "typo_change" as any, store }))); } finally { store.close(); }'`

Output:
```text
[]
```

## Per-Criterion Verification

### Criterion 1: Case A (empty array, tool entry)
> `impact({ symbols: [], changeType: "behavior_change", store, projectRoot })` returns a string containing both `## Trust` and a diagnostic that mentions `symbols` and communicates it is required. Error body contains a minimal example.

**Identify**
- Reproduction output for `impact({ symbols: [], ... })`
- `symbol_graph({ name:"impact", file:"src/tools/impact.ts", include:["source"] })`

**Run / Evidence**
- Reproduction output:
```text
=== impact({ symbols: [], changeType: 'behavior_change' }) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
```
- `symbol_graph` source for `impact`:
```text
141:55b5|  if (!params.symbols || params.symbols.length === 0) {
142:685b|    return prependTrustHeader(
143:42e2|      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
144:ab48|      { stats },
145:9d8b|    );
146:d10b|  }
```

**Verify**
- Output contains `## Trust`
- Output contains `symbols`
- Output communicates `required`
- Output includes a minimal invocation example

**Verdict:** pass

### Criterion 2: Case B / C (empty or undefined, internal function)
> `collectImpact({ symbols: [], ... })` and `collectImpact({ symbols: undefined, ... })` both return a well-defined value or throw a clean `Error` with a `symbols`-required message — not a raw `TypeError`.

**Identify**
- Reproduction output for `collectImpact({ symbols: [] })` and `collectImpact({ symbols: undefined })`
- Targeted regression test run for `test/tool-impact-empty-symbols.test.ts`
- `symbol_graph({ name:"collectImpactDetails", file:"src/tools/impact.ts", include:["source"] })`

**Run / Evidence**
- Reproduction output:
```text
=== collectImpact({ symbols: [] }) ===
[]
---
=== collectImpact({ symbols: undefined }) ===
[]
```
- Targeted regression test run:
```text
test/tool-impact-empty-symbols.test.ts:
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [1.05ms]
(pass) collectImpact() returns [] when symbols is empty array [0.79ms]

 5 pass
 0 fail
```
- `symbol_graph` source for `collectImpactDetails`:
```text
67:293e|  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
68:c8a5|  if (changeType === "addition") return [];
69:7cf7|  if (!symbols || symbols.length === 0) return [];
76:e46e|  for (const symbol of symbols) {
```

**Verify**
- Neither call throws a raw `TypeError`
- Both calls return a defined value (`[]`)
- The guard exists before the `for...of` loop

**Verdict:** pass

### Criterion 3: Case D / E (invalid `changeType`, internal function)
> `impact({ symbols: ["shared"], changeType: "typo_change" as any, ... })` returns a diagnostic listing the four valid literals. `collectImpact({ ..., changeType: "typo_change" as any })` likewise surfaces a diagnostic (throw or result-with-error).

**Identify**
- Reproduction output for `impact(valid symbol, invalid changeType)`
- Direct internal-function check with a resolvable symbol and invalid `changeType`
- `symbol_graph` source for `impact` and `collectImpactDetails`
- `read(path:"src/tools/impact.ts", symbol:"classify")`

**Run / Evidence**
- Tool-entry reproduction output:
```text
=== impact(valid symbol, invalid changeType) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nchangeType: invalid value \"typo_change\" — must be one of: signature_change, removal, behavior_change, addition\n"
```
- Direct internal-function check with resolvable symbol:
```text
[]
```
- `symbol_graph` source for `impact` shows the tool-layer validation exists:
```text
148:6fb3|  const validChangeTypes: readonly ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
149:3eac|  if (!validChangeTypes.includes(params.changeType)) {
150:685b|    return prependTrustHeader(
151:af34|      `changeType: invalid value "${params.changeType}" — must be one of: ${validChangeTypes.join(", ")}
152:b8fa|`,
153:ab48|      { stats },
154:9d8b|    );
155:d10b|  }
```
- `symbol_graph` source for `collectImpactDetails` shows there is no corresponding invalid-`changeType` guard before classification:
```text
68:c8a5|  if (changeType === "addition") return [];
69:7cf7|  if (!symbols || symbols.length === 0) return [];
...
104:9da6|      const classification = classify(changeType, depth);
105:853b|      if (!classification) continue;
```
- `classify` source confirms unknown literals still fall through to `null`:
```text
36:df2|function classify(changeType: ChangeType, depth: number): ImpactClassification | null {
37:4c4|  if (changeType === "addition") return null;
38:d2f|  if (changeType === "behavior_change") return "behavioral";
39:280|  if (changeType === "signature_change" || changeType === "removal") {
40:b35|    return depth === 1 ? "breaking" : "behavioral";
41:b18|  }
42:356|  return null;
43:b18|}
```

**Verify**
- `impact()` now returns the required diagnostic at the tool boundary
- `collectImpact()` still returns `[]` for invalid `changeType`, even with a resolvable symbol
- No internal-layer diagnostic is surfaced

**Verdict:** fail

### Criterion 4: Existing impact-related tests still pass
> All existing `impact` test files still pass.

**Identify**
- Fresh full-suite `bun test` output

**Run / Evidence**
```text
test/tool-impact-trust-header.test.ts:
(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [3.88ms]

test/tool-impact-ambiguous.test.ts:
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [1.94ms]

test/tool-impact-empty-output.test.ts:
(pass) impact() returns diagnostic message for non-existent symbol (#042) [1.32ms]
(pass) impact() returns diagnostic message for addition change type (#043) [0.77ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.38ms]

test/tool-impact-performance.test.ts:
(pass) impact renders 120 annotated dependents under one second [19.60ms]

test/tool-impact-ranking.test.ts:
(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.02ms]
(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.76ms]

test/extension-impact.test.ts:
(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [1.20ms]
(pass) impact() emits anchored structured lines and empty string for no-impact [1.36ms]
(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.20ms]

test/tool-impact.test.ts:
(pass) collectImpact classifies direct and transitive dependents by change type [1.18ms]
(pass) collectImpact respects maxDepth [0.35ms]
(pass) collectImpact returns no dependents for addition [0.26ms]
(pass) collectImpact terminates on cycles without duplicates [0.53ms]
(pass) collectImpact terminates on a 3-node cycle without duplicates [0.81ms]
(pass) collectImpact classification matrix (AC 34) across all change types [0.66ms]
```

**Verify**
- Every impact-related file named in the acceptance criterion appeared in the fresh suite run with passing tests

**Verdict:** pass

### Criterion 5: New regression test file lands green and covers the required cases
> `test/tool-impact-empty-symbols.test.ts` lands green, covering at minimum: empty-array input, `undefined` symbols input, and invalid `changeType` string.

**Identify**
- Targeted test run of `bun test test/tool-impact-empty-symbols.test.ts`
- `ast_search("test($NAME, $_)", lang:"typescript", path:"test/tool-impact-empty-symbols.test.ts")`

**Run / Evidence**
- Targeted run:
```text
test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error with example when symbols is empty array [6.63ms]
(pass) impact() returns Trust-header-wrapped error when symbols is undefined [1.17ms]
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.74ms]
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [1.05ms]
(pass) collectImpact() returns [] when symbols is empty array [0.79ms]

 5 pass
 0 fail
 16 expect() calls
Ran 5 tests across 1 file. [33.00ms]
```
- `ast_search` output:
```text
26:fa6|test("impact() returns Trust-header-wrapped error with example when symbols is empty array", () => {
47:bf7|test("impact() returns Trust-header-wrapped error when symbols is undefined", () => {
66:156|test("impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid", () => {
89:aea|test("collectImpact() returns [] (not a throw) when symbols is undefined", () => {
105:32f|test("collectImpact() returns [] when symbols is empty array", () => {
```

**Verify**
- The new file is green
- It covers empty-array input, undefined-symbols input, and invalid-`changeType` input at the `impact()` layer

**Verdict:** pass

### Criterion 6: Empty-symbols error contains a minimal invocation example
> Error message for empty symbols contains a minimal invocation example in the error body.

**Identify**
- Reproduction output for `impact({ symbols: [], ... })`
- `symbol_graph({ name:"impact", file:"src/tools/impact.ts", include:["source"] })`

**Run / Evidence**
- Reproduction output:
```text
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
```
- `symbol_graph` source excerpt:
```text
143:42e2|      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
```

**Verify**
- The diagnostic includes a minimal invocation example in the body

**Verdict:** pass

## Overall Verdict
fail

The implementation satisfies Criteria 1, 2, 4, 5, and 6. It does not satisfy Criterion 3.

Evidence:
- `impact()` validates invalid `changeType` at the tool boundary and returns the required diagnostic.
- `collectImpact()` still does not validate invalid `changeType` at the internal function layer.
- Fresh direct execution with a resolvable symbol and `changeType: "typo_change" as any` returned `[]`, not a diagnostic.
- Source inspection confirms the only runtime invalid-`changeType` guard is inside `impact()`, while `collectImpactDetails()` still falls through to `classify(changeType, depth)` and `classify()` still returns `null` for unknown literals.

Recommended next step: return to implement and add runtime invalid-`changeType` handling in `collectImpact()` / `collectImpactDetails()` plus a regression test that exercises `collectImpact({ symbols:["shared"], changeType:"typo_change" as any, ... })`.
