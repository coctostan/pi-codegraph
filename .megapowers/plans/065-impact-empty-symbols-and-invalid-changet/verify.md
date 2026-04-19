## Test Suite Results

Fresh full-suite command:

```bash
bun test
```

Relevant output excerpt:

```text
test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error with example when symbols is empty array [1.04ms]
(pass) impact() returns Trust-header-wrapped error when symbols is undefined [0.81ms]
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.57ms]
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [0.59ms]
(pass) collectImpact() returns [] when symbols is empty array [0.72ms]
(pass) collectImpact() throws a clean error listing valid literals when changeType is invalid [0.65ms]

test/tool-impact.test.ts:
(pass) collectImpact classifies direct and transitive dependents by change type [1.19ms]
(pass) collectImpact respects maxDepth [0.44ms]
(pass) collectImpact returns no dependents for addition [0.23ms]
(pass) collectImpact terminates on cycles without duplicates [0.51ms]
(pass) collectImpact terminates on a 3-node cycle without duplicates [0.74ms]
(pass) collectImpact classification matrix (AC 34) across all change types [0.57ms]

test/tool-impact-empty-output.test.ts:
(pass) impact() returns diagnostic message for non-existent symbol (#042) [1.19ms]
(pass) impact() returns diagnostic message for addition change type (#043) [0.81ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.40ms]

test/tool-impact-performance.test.ts:
(pass) impact renders 120 annotated dependents under one second [16.73ms]

test/tool-impact-trust-header.test.ts:
(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [2.05ms]

test/tool-impact-ambiguous.test.ts:
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [2.58ms]

test/extension-impact.test.ts:
(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [1.25ms]
(pass) impact() emits anchored structured lines and empty string for no-impact [1.67ms]
(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.17ms]

450 pass
0 fail
1358 expect() calls
Ran 450 tests across 188 files. [9.44s]
```

Downstream dependents for the primary changed symbol:

Command:

```text
impact({ symbols:["collectImpactDetails"], changeType:"behavior_change", maxDepth:5 })
```

Output:

```text
src/tools/impact.ts:133:0e1d  collectImpact  behavioral  depth:1  [fan-in:0, fan-out:1, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:143:dfc1  impact  behavioral  depth:1  [fan-in:0, fan-out:8, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

Tests covering those dependents:

Command:

```text
grep("collectImpact\\(|impact\\(", path:"test", glob:"**/*.test.ts", summary:true)
```

Output:

```text
[35 matches in 9 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-symbols.test.ts: 13 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact.test.ts: 9 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-output.test.ts: 4 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-impact.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-trust-header.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-performance.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/token-tracker-all-tools.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-ambiguous.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-output-signals.test.ts: 1 matches
```

All 9 files above appeared in the fresh `bun test` output.

Trace from the feature entry point:

Command:

```text
trace({ entry:"impact", file:"src/tools/impact.ts" })
```

Output excerpt:

```text
## Trust
status: heuristic
evidence: git,lsp,tree-sitter  stale-files: 0/225
mode: static (heuristic, no runtime evidence)
src/tools/impact.ts:143:dfc1  impact  function [entry-point, untested]
src/tools/impact.ts:38:af95  isValidChangeType  function [leaf, untested]
src/tools/impact.ts:42:c6e8  formatInvalidChangeTypeMessage  function [leaf, untested]
src/tools/impact.ts:76:3526  collectImpactDetails  function [untested]
```

## Per-Criterion Verification

### Criterion 1: Case A (empty array, tool entry)
**Claim:** `impact({ symbols: [], changeType: "behavior_change", store, projectRoot })` returns a Trust-header-wrapped diagnostic mentioning `symbols`, and the error body contains a minimal example.

**Evidence:**

Reproduction command:

```bash
bun -e 'import { SqliteGraphStore } from "./src/graph/sqlite.js"; import { impact, collectImpact } from "./src/tools/impact.js"; const store = new SqliteGraphStore(); try { console.log("=== impact({ symbols: [], changeType: \"behavior_change\" }) ==="); console.log(JSON.stringify(impact({ symbols: [], changeType: "behavior_change", store, projectRoot: process.cwd() }))); console.log("---"); console.log("=== collectImpact({ symbols: [] }) ==="); console.log(JSON.stringify(collectImpact({ symbols: [], changeType: "behavior_change", store }))); console.log("---"); console.log("=== collectImpact({ symbols: undefined }) ==="); try { console.log(JSON.stringify(collectImpact({ symbols: undefined, changeType: "behavior_change", store }))); } catch (err) { console.log("THREW:", err?.message ?? String(err)); } console.log("---"); console.log("=== collectImpact({ symbols: [\"foo\"], changeType: \"typo_change\" }) ==="); try { console.log(JSON.stringify(collectImpact({ symbols: ["foo"], changeType: "typo_change", store }))); } catch (err) { console.log("THREW:", err?.message ?? String(err)); } console.log("---"); console.log("=== impact({ symbols: [\"shared\"], changeType: \"typo_change\" }) ==="); store.addNode({ id: "src/lib.ts::shared:1", kind: "function", name: "shared", file: "src/lib.ts", start_line: 1, end_line: 1, content_hash: "h" }); console.log(JSON.stringify(impact({ symbols: ["shared"], changeType: "typo_change", store, projectRoot: process.cwd() }))); } finally { store.close(); }'
```

Relevant output:

```text
=== impact({ symbols: [], changeType: "behavior_change" }) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
```

Source evidence from `symbol_graph`:

```text
## impact (function)
src/tools/impact.ts:143:dfc1 [entry-point, untested]
### Guards / Preconditions
  - !params.symbols || params.symbols.length === 0
  - !isValidChangeType(params.changeType)
```

```text
152:55b5|  if (!params.symbols || params.symbols.length === 0) {
153:685b|    return prependTrustHeader(
154:42e2|      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
155:ab48|      { stats },
156:9d8b|    );
```

**Verdict:** pass

### Criterion 2: Case B / C (empty or undefined, internal function)
**Claim:** `collectImpact({ symbols: [], ... })` and `collectImpact({ symbols: undefined, ... })` return a well-defined value or clean error, not a raw `TypeError`.

**Evidence:**

Reproduction output:

```text
=== collectImpact({ symbols: [] }) ===
[]
---
=== collectImpact({ symbols: undefined }) ===
[]
```

Source evidence from `symbol_graph` and source:

```text
## collectImpactDetails (function)
src/tools/impact.ts:76:3526 [untested]
### Throws / Error paths
  - Error
### Guards / Preconditions
  - changeType === "addition"
  - !symbols || symbols.length === 0
```

```text
78:c8a5|  if (changeType === "addition") return [];
79:7cf7|  if (!symbols || symbols.length === 0) return [];
80:157e|  if (!isValidChangeType(changeType)) throw new Error(formatInvalidChangeTypeMessage(changeType));
```

`collectImpact()` still delegates directly to the guarded helper:

```text
133:0e1d|export function collectImpact(params: CollectImpactParams): ImpactItem[] {
134:efeb|  return collectImpactDetails(params).map(({ nodeId, name, file, depth, classification }) => ({
```

The raw `TypeError: undefined is not an object (evaluating 'symbols')` no longer appears in reproduction output.

**Verdict:** pass

### Criterion 3: Case D / E (invalid `changeType`, internal function)
**Claim:** invalid `changeType` is rejected both at the internal layer (`collectImpact`) and tool entry (`impact`), with a message listing valid literals.

**Evidence:**

Reproduction output:

```text
=== collectImpact({ symbols: ["foo"], changeType: "typo_change" }) ===
THREW: changeType: invalid value "typo_change" — must be one of: signature_change, removal, behavior_change, addition
---
=== impact({ symbols: ["shared"], changeType: "typo_change" }) ===
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nchangeType: invalid value \"typo_change\" — must be one of: signature_change, removal, behavior_change, addition\n"
```

Source evidence:

```text
79:7cf7|  if (!symbols || symbols.length === 0) return [];
80:157e|  if (!isValidChangeType(changeType)) throw new Error(formatInvalidChangeTypeMessage(changeType));
```

```text
159:a2cb|  if (!isValidChangeType(params.changeType)) {
160:685b|    return prependTrustHeader(
161:6c06|      formatInvalidChangeTypeMessage(params.changeType),
162:ab48|      { stats },
163:9d8b|    );
164:d10b|  }
```

Regression test evidence from the fresh suite:

```text
test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.57ms]
(pass) collectImpact() throws a clean error listing valid literals when changeType is invalid [0.65ms]
```

**Verdict:** pass

### Criterion 4: All existing `impact` test files still pass
**Claim:** the pre-existing `impact`-related test files still pass.

**Evidence:**

Fresh `bun test` output included all requested files as passing:

```text
test/tool-impact.test.ts:
(pass) collectImpact classifies direct and transitive dependents by change type [1.19ms]
(pass) collectImpact respects maxDepth [0.44ms]
(pass) collectImpact returns no dependents for addition [0.23ms]
(pass) collectImpact terminates on cycles without duplicates [0.51ms]
(pass) collectImpact terminates on a 3-node cycle without duplicates [0.74ms]
(pass) collectImpact classification matrix (AC 34) across all change types [0.57ms]

test/tool-impact-ambiguous.test.ts:
(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [2.58ms]

test/tool-impact-empty-output.test.ts:
(pass) impact() returns diagnostic message for non-existent symbol (#042) [1.19ms]
(pass) impact() returns diagnostic message for addition change type (#043) [0.81ms]

test/tool-impact-output-signals.test.ts:
(pass) impact appends always-on why annotations with chain confidence [1.40ms]

test/tool-impact-performance.test.ts:
(pass) impact renders 120 annotated dependents under one second [16.73ms]

test/tool-impact-ranking.test.ts:
(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.14ms]
(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.69ms]

test/tool-impact-trust-header.test.ts:
(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [2.05ms]

test/extension-impact.test.ts:
(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [1.25ms]
(pass) impact() emits anchored structured lines and empty string for no-impact [1.67ms]
(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.17ms]
```

**Verdict:** pass

### Criterion 5: New regression test file lands green with required cases
**Claim:** `test/tool-impact-empty-symbols.test.ts` exists, passes, and covers empty array, `undefined`, and invalid `changeType`.

**Evidence:**

Fresh suite output:

```text
test/tool-impact-empty-symbols.test.ts:
(pass) impact() returns Trust-header-wrapped error with example when symbols is empty array [1.04ms]
(pass) impact() returns Trust-header-wrapped error when symbols is undefined [0.81ms]
(pass) impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid [0.57ms]
(pass) collectImpact() returns [] (not a throw) when symbols is undefined [0.59ms]
(pass) collectImpact() returns [] when symbols is empty array [0.72ms]
(pass) collectImpact() throws a clean error listing valid literals when changeType is invalid [0.65ms]
```

Source evidence from `test/tool-impact-empty-symbols.test.ts`:

```text
26:fa6|test("impact() returns Trust-header-wrapped error with example when symbols is empty array", () => {
47:bf7|test("impact() returns Trust-header-wrapped error when symbols is undefined", () => {
66:156|test("impact() returns Trust-header-wrapped error listing valid literals when changeType is invalid", () => {
89:aea|test("collectImpact() returns [] (not a throw) when symbols is undefined", () => {
105:32f|test("collectImpact() returns [] when symbols is empty array", () => {
121:f3d|test("collectImpact() throws a clean error listing valid literals when changeType is invalid", () => {
```

**Verdict:** pass

### Criterion 6: Empty-symbols error contains a minimal invocation example
**Claim:** the empty-symbols diagnostic includes a minimal invocation example in the error body.

**Evidence:**

Reproduction output:

```text
"## Trust\nstatus: fresh\nevidence: none  stale-files: 0/0\nsymbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: [\"functionName\"], changeType: \"behavior_change\" })\n"
```

Source evidence:

```text
154:42e2|      `symbols: 'symbols' is required — provide one or more symbol names to analyze.\n\nExample: impact({ symbols: ["functionName"], changeType: "behavior_change" })\n`,
```

**Verdict:** pass

## Overall Verdict

pass

Summary:
- The original bug no longer reproduces.
- `impact()` now emits Trust-header-wrapped diagnostics for empty `symbols` and invalid `changeType`.
- `collectImpact()` / `collectImpactDetails()` no longer throw a raw `TypeError` for `undefined` `symbols`, and they now reject invalid `changeType` with a clean error message.
- Existing `impact`-related tests still pass, and the new regression file is green.
