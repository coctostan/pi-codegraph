## Test Suite Results

### Full suite
**Command:** `bun test`

**Relevant output excerpt:**
```text
test/token-tracker-all-tools.test.ts:
(pass) appendTokenMeta works with impact [1.44ms]
(pass) session accumulates across multiple tool calls [1.34ms]

test/tool-impact-trust-header.test.ts:
(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [2.59ms]

...

test/extension-impact.test.ts:
(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [1.56ms]
(pass) impact() emits anchored structured lines and empty string for no-impact [1.07ms]
(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.11ms]

...

test/tool-impact-ranking.test.ts:
(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.14ms]
(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.65ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.76ms]

...

test/tool-impact-ambiguous.test.ts:
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [2.08ms]

...

test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns error message when symbols is empty array [1.72ms]
(pass) impact() returns error message when symbols is undefined [0.76ms]
(pass) impact() returns error message for invalid changeType [0.61ms]
(pass) collectImpactDetails() returns [] without entering BFS when symbols is empty [0.70ms]

...

test/tool-impact-performance.test.ts:
(pass) impact renders 120 annotated dependents under one second [18.38ms]

...

test/tool-impact.test.ts:
(pass) collectImpact classifies direct and transitive dependents by change type [1.21ms]
(pass) collectImpact respects maxDepth [0.01ms]
(pass) collectImpact returns no dependents for addition [0.52ms]
(pass) collectImpact terminates on cycles without duplicates [0.56ms]
(pass) collectImpact terminates on a 3-node cycle without duplicates [0.50ms]
(pass) collectImpact classification matrix (AC 34) across all change types [0.52ms]

...

test/tool-impact-empty-output.test.ts:
(pass) impact() returns diagnostic message for non-existent symbol (#042) [0.97ms]
(pass) impact() returns diagnostic message for addition change type (#043) [0.69ms]

 448 pass
 0 fail
 1353 expect() calls
Ran 448 tests across 188 files. [9.94s]
```

### Regression file
**Command:** `bun test test/tool-impact-empty-symbols.test.ts`

**Actual output:**
```text
bun test v1.3.11 (af24e281)

test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns error message when symbols is empty array [6.45ms]
(pass) impact() returns error message when symbols is undefined [1.38ms]
(pass) impact() returns error message for invalid changeType [1.64ms]
(pass) collectImpactDetails() returns [] without entering BFS when symbols is empty [3.41ms]

 4 pass
 0 fail
 12 expect() calls
Ran 4 tests across 1 file. [40.00ms]
```

### Dependency coverage check
**Command:** `impact({ symbols: ["collectImpactDetails"], changeType: "behavior_change", maxDepth: 5 })`

**Actual output:**
```text
src/tools/impact.ts:122:0e1d  collectImpact  behavioral  depth:1  [fan-in:0, fan-out:1, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:132:dfc1  impact  behavioral  depth:1  [fan-in:0, fan-out:6, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

**Command:** `grep("collectImpact|impact\\(", path:"test", glob:"**/*.test.ts", summary:true)`

**Actual output:**
```text
[43 matches in 10 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact.test.ts: 16 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-symbols.test.ts: 9 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-ranking.test.ts: 5 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-output.test.ts: 4 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-impact.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-trust-header.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-performance.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-output-signals.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-ambiguous.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/token-tracker-all-tools.test.ts: 1 matches
```

**Verification:** The changed helper’s surfaced dependents are `collectImpact` and `impact`. The full suite run above includes the files that exercise those symbols directly (`test/tool-impact.test.ts`, `test/tool-impact-empty-symbols.test.ts`, `test/tool-impact-ranking.test.ts`, `test/tool-impact-empty-output.test.ts`, `test/tool-impact-trust-header.test.ts`, `test/tool-impact-output-signals.test.ts`, `test/tool-impact-ambiguous.test.ts`, `test/tool-impact-performance.test.ts`, `test/extension-impact.test.ts`, `test/token-tracker-all-tools.test.ts`).

## Bug Reproduction / Symptom Check

**Command:** inline `bun -e` reproducer calling `impact()` and `collectImpactDetails()` directly with invalid inputs.

**Actual output:**
```text
CASE empty symbols:
## Trust
status: fresh
evidence: none  stale-files: 0/0
Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.

Example: impact({ symbols: ["functionName"], changeType: "behavior_change" })

CASE undefined symbols threw: false
CASE undefined symbols output:
## Trust
status: fresh
evidence: none  stale-files: 0/0
Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.

Example: impact({ symbols: ["functionName"], changeType: "behavior_change" })

CASE invalid changeType:
## Trust
status: fresh
evidence: none  stale-files: 0/0
Error: Invalid changeType "invalid_type". Must be one of: signature_change, removal, behavior_change, addition

CASE collectImpactDetails result: []
CASE collectImpactDetails getNeighborsCalls: 0
```

**Verification:** The original failure modes no longer occur:
- `symbols: []` no longer returns the empty 56-byte Trust header; it returns an explicit error.
- `symbols: undefined` does not throw; the reproducer printed `CASE undefined symbols threw: false`.
- invalid `changeType` no longer collapses to the empty Trust header; it returns an explicit error listing the four literals.
- `collectImpactDetails({ symbols: [] })` returns `[]` and never calls `getNeighbors`.

## Execution Path Evidence

**Tool entrypoint read:**
```text
281:9da|  registerReadOnlyTool(pi, {
282:a2f|    name: "impact",
283:1c9|    label: "Impact",
284:f96|    description: "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
285:70e|    parameters: ImpactParams,
286:902|    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
287:80b|      const projectRoot = ctx.cwd;
288:d96|      const store = getOrCreateStore(projectRoot);
289:df4|      await ensureIndexed(projectRoot, store);
290:af4|      const text = impact({
291:b97|        symbols: params.symbols,
292:233|        changeType: params.changeType,
293:dd4|        store,
294:170|        projectRoot,
295:98a|        maxDepth: params.maxDepth,
296:d86|      });
297:418|      const output = finalizeReadOnlyOutput("impact", { symbols: params.symbols }, text, store, projectRoot);
```

**Trace:** `trace({ entry: "impact", file: "src/tools/impact.ts" })`

**Actual output excerpt:**
```text
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/225
mode: static (heuristic, no runtime evidence)
src/tools/impact.ts:132:dfc1  impact  function [entry-point, untested]
...
src/tools/impact.ts:66:3526  collectImpactDetails  function [untested]
```

**Verification:** The public tool path is `src/index.ts:290 -> impact(...)`, and `trace` confirms `impact` reaches `collectImpactDetails`, which is the helper changed in this issue.

## Per-Criterion Verification

### Criterion 1: Calling `impact({ symbols: [], changeType: "behavior_change", ... })` returns a Trust-header-wrapped body whose body contains the word `Error`, references `symbols`, and includes a minimal error-path usage example.
**Identify:** Direct reproducer output, regression test, and source inspection of `impact`.

**Evidence:**
- Reproducer output:
```text
CASE empty symbols:
## Trust
status: fresh
evidence: none  stale-files: 0/0
Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.

Example: impact({ symbols: ["functionName"], changeType: "behavior_change" })
```
- Source (`symbol_graph("impact", include:["source","contract"])`):
```text
146:55b5|  if (!params.symbols || params.symbols.length === 0) {
147:685b|    return prependTrustHeader(
148:b29f|      "Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n",
149:ab48|      { stats },
150:9d8b|    );
151:d10b|  }
```
- Test file anchors:
```text
28:739|test("impact() returns error message when symbols is empty array", () => {
31:bef|    const out = impact({
32:1c9|      symbols: [],
38:57f|    expect(out).toContain("## Trust");
39:636|    expect(out).toContain("Error");
40:3e5|    expect(out).toContain("symbols");
41:dc7|    expect(out).toContain("required");
```
- Test run:
```text
(pass) impact() returns error message when symbols is empty array [6.45ms]
```

**Verdict:** pass

### Criterion 2: Calling `impact({ symbols: undefined as any, changeType: "behavior_change", ... })` returns the same (or equivalent) Trust-wrapped error without throwing.
**Identify:** Direct reproducer output and regression test.

**Evidence:**
- Reproducer output:
```text
CASE undefined symbols threw: false
CASE undefined symbols output:
## Trust
status: fresh
evidence: none  stale-files: 0/0
Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.

Example: impact({ symbols: ["functionName"], changeType: "behavior_change" })
```
- Test file anchors:
```text
48:b76|test("impact() returns error message when symbols is undefined", () => {
51:bef|    const out = impact({
52:ac5|      symbols: undefined as any,
58:57f|    expect(out).toContain("## Trust");
59:636|    expect(out).toContain("Error");
60:3e5|    expect(out).toContain("symbols");
```
- Test run:
```text
(pass) impact() returns error message when symbols is undefined [1.38ms]
```

**Verdict:** pass

### Criterion 3: Calling `impact({ symbols: ["shared"], changeType: "invalid_type" as any, ... })` returns a Trust-header-wrapped body containing the word `Error`, referencing `changeType`, and listing the four valid literals: `signature_change`, `removal`, `behavior_change`, `addition`.
**Identify:** Direct reproducer output, source inspection, and regression test.

**Evidence:**
- Reproducer output:
```text
CASE invalid changeType:
## Trust
status: fresh
evidence: none  stale-files: 0/0
Error: Invalid changeType "invalid_type". Must be one of: signature_change, removal, behavior_change, addition
```
- Source (`symbol_graph("impact", include:["source","contract"])`):
```text
158:8e35|  const validChangeTypes: ChangeType[] = ["signature_change", "removal", "behavior_change", "addition"];
159:3eac|  if (!validChangeTypes.includes(params.changeType)) {
160:685b|    return prependTrustHeader(
161:77d5|      `Error: Invalid changeType "${params.changeType}". Must be one of: ${validChangeTypes.join(", ")}\n`,
162:ab48|      { stats },
163:9d8b|    );
164:d10b|  }
```
- Test file anchors:
```text
68:baa|test("impact() returns error message for invalid changeType", () => {
71:bef|    const out = impact({
72:938|      symbols: ["shared"],
73:0d0|      changeType: "invalid_type" as any,
78:57f|    expect(out).toContain("## Trust");
79:636|    expect(out).toContain("Error");
80:65c|    expect(out).toContain("changeType");
```
- Test run:
```text
(pass) impact() returns error message for invalid changeType [1.64ms]
```

**Verdict:** pass

### Criterion 4: `collectImpactDetails({ symbols: [], ... })` returns `[]` without entering the BFS (defensive early-exit mirrors the `impact()` guard).
**Identify:** Direct reproducer output with `getNeighborsCalls`, source inspection, trace, and regression test.

**Evidence:**
- Reproducer output:
```text
CASE collectImpactDetails result: []
CASE collectImpactDetails getNeighborsCalls: 0
```
- Source (`symbol_graph("collectImpactDetails", include:["source"] )`):
```text
66:3526|export function collectImpactDetails(params: CollectImpactParams): ImpactDetail[] {
67:293e|  const { symbols, changeType, store, maxDepth = 5, signalComputer: providedSignalComputer } = params;
68:c8a5|  if (changeType === "addition") return [];
69:7cf7|  if (!symbols || symbols.length === 0) return [];
70:e3b0|
```
- Trace on public path:
```text
src/tools/impact.ts:132:dfc1  impact  function [entry-point, untested]
...
src/tools/impact.ts:66:3526  collectImpactDetails  function [untested]
```
- Test file anchors:
```text
88:0ba|test("collectImpactDetails() returns [] without entering BFS when symbols is empty", () => {
91:e26|    let getNeighborsCalls = 0;
103:9cb|    const result = collectImpactDetails({
104:1c9|      symbols: [],
109:11b|    expect(result).toEqual([]);
113:856|    expect(getNeighborsCalls).toBe(0);
```
- Test run:
```text
(pass) collectImpactDetails() returns [] without entering BFS when symbols is empty [3.41ms]
```

**Verdict:** pass

### Criterion 5: The new file `test/tool-impact-empty-symbols.test.ts` passes.
**Identify:** File existence read + targeted test run.

**Evidence:**
- File content exists at `test/tool-impact-empty-symbols.test.ts` with four regression tests:
```text
1:dac|import { expect, test } from "bun:test";
8:c2b|import { collectImpactDetails, impact } from "../src/tools/impact.js";
28:739|test("impact() returns error message when symbols is empty array", () => {
48:b76|test("impact() returns error message when symbols is undefined", () => {
68:baa|test("impact() returns error message for invalid changeType", () => {
88:0ba|test("collectImpactDetails() returns [] without entering BFS when symbols is empty", () => {
```
- Targeted test run:
```text
 4 pass
 0 fail
Ran 4 tests across 1 file. [40.00ms]
```

**Verdict:** pass

### Criterion 6: All pre-existing impact tests continue to pass — specifically the impact-related files plus `extension-impact.test.ts` and `token-tracker-all-tools.test.ts`.
**Identify:** Fresh full-suite run plus dependency coverage check from `impact` on the changed helper.

**Evidence:**
- Full suite summary:
```text
 448 pass
 0 fail
 1353 expect() calls
Ran 448 tests across 188 files. [9.94s]
```
- Relevant impacted files present in the full-suite output:
```text
test/token-tracker-all-tools.test.ts:
test/tool-impact-trust-header.test.ts:
test/extension-impact.test.ts:
test/tool-impact-ranking.test.ts:
test/tool-impact-output-signals.test.ts:
test/tool-impact-ambiguous.test.ts:
test/tool-impact-empty-symbols.test.ts:
test/tool-impact-performance.test.ts:
test/tool-impact.test.ts:
test/tool-impact-empty-output.test.ts:
```
- Downstream dependents from the changed helper:
```text
src/tools/impact.ts:122:0e1d  collectImpact  behavioral  depth:1  ...
src/tools/impact.ts:132:dfc1  impact  behavioral  depth:1  ...
```
- Test references covering those dependents:
```text
[43 matches in 10 files]
...
test/tool-impact.test.ts: 16 matches
...
test/extension-impact.test.ts: 3 matches
...
test/token-tracker-all-tools.test.ts: 1 matches
```

**Verdict:** pass

### Criterion 7: Error messages live on the error path, not in tool descriptions — compliant with the M10 Phase 2 rule (`description` strings in `ImpactParams` remain example-free).
**Identify:** Inspect `src/index.ts` descriptions and `src/tools/impact.ts` error-path source.

**Evidence:**
- `ImpactParams` descriptions remain generic and example-free:
```text
50:cc8|const ImpactParams = Type.Object({
51:236|  symbols: Type.Array(Type.String({ description: "Changed symbol name" }), {
52:5d6|    description: "One or more symbol names that changed",
53:e2c|  }),
54:f59|  changeType: Type.Union(
55:34f|    [
56:292|      Type.Literal("signature_change"),
57:0ee|      Type.Literal("removal"),
58:b45|      Type.Literal("behavior_change"),
59:9e6|      Type.Literal("addition"),
60:34f|    ],
61:525|    { description: "Kind of change" },
62:5f9|  ),
63:8d6|  maxDepth: Type.Optional(
64:a4a|    Type.Number({ description: "Maximum traversal depth (default 5)" }),
65:5f9|  ),
66:d86|});
```
- Tool description remains generic and example-free:
```text
282:a2f|    name: "impact",
283:1c9|    label: "Impact",
284:f96|    description: "Return the classified blast radius for a set of changed symbols.\nWhen to use: You are planning or reviewing a change to existing code.",
285:70e|    parameters: ImpactParams,
```
- Error strings and example live inside the function error path instead:
```text
146:55b5|  if (!params.symbols || params.symbols.length === 0) {
147:685b|    return prependTrustHeader(
148:b29f|      "Error: 'symbols' parameter is required. Provide one or more symbol names to analyze impact.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n",
...
159:3eac|  if (!validChangeTypes.includes(params.changeType)) {
160:685b|    return prependTrustHeader(
161:77d5|      `Error: Invalid changeType "${params.changeType}". Must be one of: ${validChangeTypes.join(", ")}\n`,
```

**Verdict:** pass

## Overall Verdict
pass

All 7 acceptance criteria are satisfied with fresh evidence from this session. The original bug symptoms were reproduced via direct function calls and are gone: empty/undefined `symbols` now return a Trust-wrapped error, invalid `changeType` now returns a Trust-wrapped literal-list error, and `collectImpactDetails({ symbols: [] })` returns `[]` without entering BFS. The full suite passed (`448 pass, 0 fail`), and the impacted dependents surfaced by `impact` (`collectImpact`, `impact`) are exercised by the test files that ran in that suite.
