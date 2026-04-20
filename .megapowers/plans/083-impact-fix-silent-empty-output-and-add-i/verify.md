## Test Suite Results

**Project convention check**
- `AGENTS.md:67` documents **Bun runtime**.
- The repo uses `bun:test` imports in the impacted tests, so the correct test command is `bun test`.

**Command run fresh**
```bash
bun test
```

**Raw log saved at**
- `.megapowers/plans/083-impact-fix-silent-empty-output-and-add-i/verify-bun-test-full.log`

**Suite summary (fresh run)**
```text
702:c1d| 385 pass
703:689| 0 fail
704:207| 1127 expect() calls
705:7a6|Ran 385 tests across 157 files. [9.96s]
```

**Relevant impacted suites from the fresh run**
```text
35:065|test/tool-impact-trust-header.test.ts:
36:342|(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [1.96ms]

300:380|test/extension-impact.test.ts:
301:947|(pass) computeAnchor returns existing anchor format file:line:hash and stale flag [0.88ms]
302:49b|(pass) impact() emits anchored structured lines and empty string for no-impact [1.23ms]
303:fe5|(pass) pi extension default export registers tool name "impact" with symbols/changeType schema [0.10ms]

323:954|test/tool-impact-ranking.test.ts:
324:cde|(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.13ms]
325:9b6|(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.66ms]

327:dc2|test/tool-impact-output-signals.test.ts:
328:9d6|(pass) impact appends always-on why annotations with chain confidence [1.24ms]

353:3b6|test/tool-impact-ambiguous.test.ts:
354:948|(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [1.73ms]

391:071|test/tool-impact-empty-symbols.test.ts:
392:a06|(pass) impact() returns error message when symbols is empty array [1.27ms]
393:f5c|(pass) impact() returns error message when symbols is undefined [0.55ms]
394:015|(pass) impact() returns error message for invalid changeType [0.44ms]

461:a48|test/tool-impact-performance.test.ts:
462:bfd|(pass) impact renders 120 annotated dependents under one second [19.61ms]

514:9ce|test/tool-impact-implements-edges.test.ts:
515:d12|(pass) collectImpact follows inbound `implements` edges: interface change reaches implementors and their callers [1.19ms]
516:b35|(pass) collectImpact deduplicates a node that both `calls` and `implements` a changed seed (AC #074.5) [0.47ms]

540:74d|test/tool-impact-empty-diagnostic.test.ts:
541:2cf|(pass) impact() entry-point seed — fanIn 0, no callers — emits entry-point diagnostic [1.05ms]
542:38d|(pass) impact() interface seed without implementors — emits interface diagnostic [0.54ms]
543:6c7|(pass) impact() genuinely isolated symbol (non-entry, non-interface, no inbound) falls back to isolated diagnostic [0.93ms]
544:b4d|(pass) impact() multiple seeds with mixed empty categories — one line per seed (stable order) [1.13ms]

552:dd4|test/tool-impact.test.ts:
553:f7a|(pass) collectImpact classifies direct and transitive dependents by change type [1.18ms]
554:008|(pass) collectImpact respects maxDepth [0.30ms]
555:efd|(pass) collectImpact returns no dependents for addition [0.20ms]
556:b12|(pass) collectImpact terminates on cycles without duplicates [0.90ms]
557:ad2|(pass) collectImpact terminates on a 3-node cycle without duplicates [0.67ms]
558:65d|(pass) collectImpact classification matrix (AC 34) across all change types [0.06ms]

629:487|test/tool-impact-083-repro.test.ts:
630:994|(pass) BUG #073: impact on an entry-point symbol returns the entry-point diagnostic [1.28ms]
631:9d0|(pass) BUG #073 + #074: impact on an interface with implementors returns the implementor chain (not the interface diagnostic) [1.16ms]
632:cb6|(pass) BUG #074: impact on an interface traverses implements edges via collectImpact [0.79ms]

634:d6a|test/tool-impact-empty-output.test.ts:
635:830|(pass) impact() returns diagnostic message for non-existent symbol (#042) [0.86ms]
636:042|(pass) impact() returns diagnostic message for addition change type (#043) [0.87ms]
```

### Primary changed-symbol blast radius and test coverage check

**Command run**
```text
impact({ symbols: ["collectImpactDetails"], changeType: "behavior_change", maxDepth: 5 })
```

**Output**
```text
src/tools/impact.ts:123:0e1d  collectImpact  behavioral  depth:1  [fan-in:0, fan-out:1, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
src/tools/impact.ts:161:dfc1  impact  behavioral  depth:1  [fan-in:0, fan-out:7, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.90]
```

**Caller shape cross-check via `symbol_graph`**
```text
## collectImpactDetails (function)
src/tools/impact.ts:66:3526

### Key Relationships
  Callers (2):  collectImpact, impact
```

**Test-file coverage for surfaced dependents**
- `collectImpact(` grep summary:
```text
[14 matches in 3 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact.test.ts: 9 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-implements-edges.test.ts: 4 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-083-repro.test.ts: 1 matches
```
- `impact(` grep summary:
```text
[31 matches in 10 files]
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-diagnostic.test.ts: 8 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-symbols.test.ts: 6 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-empty-output.test.ts: 4 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/token-tracker-all-tools.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/extension-impact.test.ts: 3 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-trust-header.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-083-repro.test.ts: 2 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-ambiguous.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-output-signals.test.ts: 1 matches
/Users/maxwellnewman/pi/workspace/pi-codegraph/test/tool-impact-performance.test.ts: 1 matches
```
- Fresh suite log includes those files at lines `18-20`, `35-36`, `300-303`, `327-328`, `353-354`, `391-394`, `461-462`, `514-516`, `540-544`, `552-558`, and `629-636`.

## Bug Reproduction Check

**Command run**
```bash
bun -e '<reproduction script constructing entryPoint / Store / MyStore / useStore and calling impact + collectImpact>'
```

**Raw log saved at**
- `.megapowers/plans/083-impact-fix-silent-empty-output-and-add-i/verify-reproduction.log`

**Output**
```text
1:20e|ENTRY_OUTPUT_START
2:8ac|## Trust
3:d34|status: fresh
4:819|evidence: lsp,tree-sitter  stale-files: 0/0
5:d6d|No dependents found — 'entryPoint' is an entry point with no callers.
6:d05|
7:e18|ENTRY_OUTPUT_END
8:746|INTERFACE_OUTPUT_START
9:8ac|## Trust
10:acf|status: mixed
11:819|evidence: lsp,tree-sitter  stale-files: 0/0
12:64f|src/iface.ts:2:3fd2  MyStore  breaking  depth:1 [stale]  [fan-in:1, fan-out:0, roles:leaf, coverage:untested, co-change:0.00, chain-confidence:0.90]
13:eeb|src/iface.ts:3:a81b  useStore  behavioral  depth:2 [stale]  [fan-in:0, fan-out:1, roles:entry-point, coverage:untested, co-change:0.00, chain-confidence:0.80]
14:d05|
15:748|INTERFACE_OUTPUT_END
16:f08|COLLECT_IMPACT_START
17:34f|[
18:1fc|  {
19:653|    "nodeId": "src/iface.ts::MyStore:2",
20:0c3|    "name": "MyStore",
21:d2b|    "file": "src/iface.ts",
22:fd6|    "depth": 1,
23:e0b|    "classification": "breaking"
24:2f6|  },
25:1fc|  {
26:23f|    "nodeId": "src/iface.ts::useStore:3",
27:6eb|    "name": "useStore",
28:d2b|    "file": "src/iface.ts",
29:fca|    "depth": 2,
30:999|    "classification": "behavioral"
31:b18|  }
32:ef9|]
33:317|COLLECT_IMPACT_END
```

**Verification**
- The original #073 symptom was header-only output. That symptom is gone: line `5` now contains the explicit entry-point diagnostic.
- The original #074 symptom was `collectImpact(...) === []`. That symptom is gone: lines `17-32` now contain `MyStore` and `useStore`.
- The reproduction fixture uses synthetic `content_hash: "h"`, so the anchored interface rows are marked `[stale]`; that does not affect the previously broken symptom, which was silent output / empty traversal.

## Per-Criterion Verification

### Criterion 1: `collectImpactDetails` performs a one-hop `implements` inbound expansion for each seed before the calls BFS, enqueuing each implementor at `depth: 1` with chain confidence equal to the `implements` edge confidence, and each resulting implementor enters the same `calls` BFS used today. `classify(changeType, 1)` is used unchanged, so implementors land as `breaking` for `signature_change`/`removal` and `behavioral` for `behavior_change`.
**Evidence**
- `symbol_graph(name: "collectImpactDetails", file: "src/tools/impact.ts", include: ["source"])`:
```text
89:7d68|    const inboundCalls = store.getNeighbors(current.id, { direction: "in", kind: "calls" });
90:b28b|    const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
91:79c2|    const inbound = dedupeInboundByStrongestEdge([...inboundCalls, ...inboundImplements]);
```
- `ast_search("$OBJ.getNeighbors($ID, { direction: \"in\", kind: \"implements\" })", lang:"typescript", path:"src")`:
```text
--- src/indexer/lsp-resolver.ts ---
>>175:488|    for (const neighbor of store.getNeighbors(node.id, { direction: "in", kind: "implements" })) {
--- src/tools/impact.ts ---
>>90:967|    const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
```
- Dedicated regression test source (`test/tool-impact-implements-edges.test.ts`) asserts all three change types:
```text
43:c7b|    const sig = collectImpact({ symbols: ["Store"], changeType: "signature_change", store, maxDepth: 5 });
44:4e6|    expect(sig).toEqual([
45:09c|      { nodeId: "src/impl.ts::MyStore:1", name: "MyStore", file: "src/impl.ts", depth: 1, classification: "breaking" },
46:7f9|      { nodeId: "src/app.ts::useStore:1", name: "useStore", file: "src/app.ts", depth: 2, classification: "behavioral" },
49:ac1|    const removal = collectImpact({ symbols: ["Store"], changeType: "removal", store, maxDepth: 5 });
51:fab|    expect(removal.find((h) => h.name === "MyStore")?.classification).toBe("breaking");
53:c89|    const behavioral = collectImpact({ symbols: ["Store"], changeType: "behavior_change", store, maxDepth: 5 });
54:a5b|    expect(behavioral.map((h) => h.classification)).toEqual(["behavioral", "behavioral"]);
```
- Dedicated regression test run:
```text
3:9ce|test/tool-impact-implements-edges.test.ts:
4:ff1|(pass) collectImpact follows inbound `implements` edges: interface change reaches implementors and their callers [7.37ms]
7:40b| 2 pass
8:689| 0 fail
```
- Raw reproduction output confirms the traversal and confidence on real output:
```text
12:64f|src/iface.ts:2:3fd2  MyStore  breaking  depth:1 [stale]  ... chain-confidence:0.90
13:eeb|src/iface.ts:3:a81b  useStore  behavioral  depth:2 [stale]  ... chain-confidence:0.80
```
**Verdict:** pass

### Criterion 2: When a seed node is itself both the target of an `implements` edge and reachable via `calls` from another seed, the node is not duplicated in the output.
**Evidence**
- Dedupe assertion in the regression test source:
```text
70:c2f|    const hits = collectImpact({ symbols: ["Store"], changeType: "signature_change", store, maxDepth: 5 });
72:4ab|    expect(hits.filter((h) => h.nodeId === "src/dual.ts::Dual:1")).toHaveLength(1);
75:18f|    expect(dual.depth).toBe(1);
76:a0b|    expect(dual.classification).toBe("breaking");
```
- Fresh dedicated test run:
```text
3:9ce|test/tool-impact-implements-edges.test.ts:
5:5d9|(pass) collectImpact deduplicates a node that both `calls` and `implements` a changed seed (AC #074.5) [0.74ms]
7:40b| 2 pass
8:689| 0 fail
```
**Verdict:** pass

### Criterion 3: `impact()` replaces the bare `return prependTrustHeader("", { stats })` with a diagnostic that distinguishes entry-point, interface, and isolated cases.
**Evidence**
- `symbol_graph(name: "buildEmptyImpactDiagnostic", file: "src/tools/impact.ts", include: ["source"])`:
```text
147:2507|    const signals = signalComputer.compute(node.id, []);
148:3ed1|    if (node.kind === "interface") {
150:acb1|        `No call-edge dependents found for interface '${node.name}'. Consider checking implementors via symbol_graph.`,
152:d9c2|    } else if (signals.roles.includes("entry-point")) {
153:eb95|      lines.push(`No dependents found — '${node.name}' is an entry point with no callers.`);
154:9850|    } else {
155:ba44|      lines.push(`No dependents found for '${node.name}' within depth ${maxDepth}.`);
```
- `read(path:"src/tools/impact.ts", symbol:"impact")` shows the empty-hit branch now calls the helper:
```text
213:c5c|  if (hits.length === 0) {
214:e51|    const body = buildEmptyImpactDiagnostic(params.symbols, params.store, signalComputer, params.maxDepth ?? 5);
215:c4d|    return prependTrustHeader(body, { stats });
```
- Dedicated regression test source covers all three categories:
```text
14:7f1|test("impact() entry-point seed — fanIn 0, no callers — emits entry-point diagnostic", () => {
23:73a|    expect(out).toContain("No dependents found — 'entryPoint' is an entry point with no callers.");
32:96e|test("impact() interface seed without implementors — emits interface diagnostic", () => {
41:266|    expect(out).toContain("No call-edge dependents found for interface 'GraphStore'. Consider checking implementors via symbol_graph.");
49:17b|test("impact() genuinely isolated symbol (non-entry, non-interface, no inbound) falls back to isolated diagnostic", () => {
59:dbb|    expect(out).toContain("No dependents found for 'sha256Hex' within depth 5.");
```
- Fresh dedicated test run:
```text
3:74d|test/tool-impact-empty-diagnostic.test.ts:
4:9cc|(pass) impact() entry-point seed — fanIn 0, no callers — emits entry-point diagnostic [7.73ms]
5:814|(pass) impact() interface seed without implementors — emits interface diagnostic [1.27ms]
6:9cd|(pass) impact() genuinely isolated symbol (non-entry, non-interface, no inbound) falls back to isolated diagnostic [1.75ms]
9:346| 4 pass
10:689| 0 fail
```
- Trace from the real entry point `impact` shows the new code is on the executed call path:
```text
## Trust
status: heuristic
mode: static (heuristic, no runtime evidence)
src/tools/impact.ts:161:dfc1  impact  function [entry-point, untested]
...
src/tools/impact.ts:66:3526  collectImpactDetails  function [untested]
...
src/tools/impact.ts:133:ee2f  buildEmptyImpactDiagnostic  function [leaf, untested]
```
- Raw reproduction output no longer shows header-only output:
```text
2:8ac|## Trust
5:d6d|No dependents found — 'entryPoint' is an entry point with no callers.
```
**Verdict:** pass

### Criterion 4: Multiple-seed input reports one line per seed in stable input order.
**Evidence**
- Ordering assertion in the regression test source:
```text
67:d76|test("impact() multiple seeds with mixed empty categories — one line per seed (stable order)", () => {
76:3f2|    const out = impact({ symbols: ["entryPoint", "GraphStore"], changeType: "signature_change", store, projectRoot, maxDepth: 5 });
77:234|    const entryIdx = out.indexOf("'entryPoint' is an entry point");
78:99a|    const ifaceIdx = out.indexOf("interface 'GraphStore'");
79:279|    expect(entryIdx).toBeGreaterThan(-1);
80:4c0|    expect(ifaceIdx).toBeGreaterThan(-1);
82:1fa|    expect(entryIdx).toBeLessThan(ifaceIdx);
```
- Fresh dedicated test run:
```text
3:74d|test/tool-impact-empty-diagnostic.test.ts:
7:8f0|(pass) impact() multiple seeds with mixed empty categories — one line per seed (stable order) [2.05ms]
9:346| 4 pass
10:689| 0 fail
```
**Verdict:** pass

### Criterion 5: All three reproduction tests in `test/tool-impact-083-repro.test.ts` pass.
**Evidence**
- Fresh dedicated reproduction regression run:
```text
3:487|test/tool-impact-083-repro.test.ts:
4:4b7|(pass) BUG #073: impact on an entry-point symbol returns the entry-point diagnostic [5.27ms]
5:111|(pass) BUG #073 + #074: impact on an interface with implementors returns the implementor chain (not the interface diagnostic) [6.86ms]
6:84a|(pass) BUG #074: impact on an interface traverses implements edges via collectImpact [2.38ms]
8:906| 3 pass
9:689| 0 fail
```
- The raw non-test reproduction also no longer exhibits the original symptoms (see `verify-reproduction.log`, lines `1-33`).
**Verdict:** pass

### Criterion 6: Existing tests continue to pass with no structural changes in behavior for unaffected callers.
**Evidence**
- Fresh full suite summary:
```text
702:c1d| 385 pass
703:689| 0 fail
705:7a6|Ran 385 tests across 157 files. [9.96s]
```
- Named suites from the diagnosis all ran and passed in the fresh suite:
```text
35:065|test/tool-impact-trust-header.test.ts:
36:342|(pass) impact prepends the shared trust header and marks stale-file scenarios as stale [1.96ms]

300:380|test/extension-impact.test.ts:
302:49b|(pass) impact() emits anchored structured lines and empty string for no-impact [1.23ms]

323:954|test/tool-impact-ranking.test.ts:
324:cde|(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence [1.13ms]
325:9b6|(pass) collectImpactDetails prioritizes untested before tested ahead of depth [0.66ms]

327:dc2|test/tool-impact-output-signals.test.ts:
328:9d6|(pass) impact appends always-on why annotations with chain confidence [1.24ms]

353:3b6|test/tool-impact-ambiguous.test.ts:
354:948|(pass) impact returns a disambiguation list instead of aggregating all ambiguous symbol matches [1.73ms]

461:a48|test/tool-impact-performance.test.ts:
462:bfd|(pass) impact renders 120 annotated dependents under one second [19.61ms]

552:dd4|test/tool-impact.test.ts:
553:f7a|(pass) collectImpact classifies direct and transitive dependents by change type [1.18ms]
...
558:65d|(pass) collectImpact classification matrix (AC 34) across all change types [0.06ms]

634:d6a|test/tool-impact-empty-output.test.ts:
635:830|(pass) impact() returns diagnostic message for non-existent symbol (#042) [0.86ms]
636:042|(pass) impact() returns diagnostic message for addition change type (#043) [0.87ms]
```
- Downstream dependent coverage check was also satisfied: the changed symbol `collectImpactDetails` surfaced `collectImpact` and `impact`, and fresh-suite test files covering both were identified by grep and observed in the suite log.
**Verdict:** pass

### Criterion 7: No changes to `GraphStore` / `NeighborOptions` / `EdgeKind` — the fix lives entirely inside `src/tools/impact.ts`.
**Evidence**
- `git diff --name-only -- src` and `git status --short -- src test`:
```text
1:dd5|DIFF_SRC
2:be0|src/tools/impact.ts
3:d05|
4:ee7|STATUS_SRC_TEST
5:990| M src/tools/impact.ts
6:175|?? test/tool-impact-083-repro.test.ts
7:436|?? test/tool-impact-empty-diagnostic.test.ts
8:ee5|?? test/tool-impact-implements-edges.test.ts
```
- `ast_search` showed the repo already used the `implements` edge kind in `src/indexer/lsp-resolver.ts`; the change adds a reader in `src/tools/impact.ts` without modifying graph/store/type definitions:
```text
--- src/indexer/lsp-resolver.ts ---
>>175:488|    for (const neighbor of store.getNeighbors(node.id, { direction: "in", kind: "implements" })) {
--- src/tools/impact.ts ---
>>90:967|    const inboundImplements = store.getNeighbors(current.id, { direction: "in", kind: "implements" });
```
**Verdict:** pass

## Overall Verdict
pass

The implementation satisfies all seven acceptance criteria. Fresh full-suite evidence shows `385 pass / 0 fail`, the raw reproduction no longer shows the original silent-output or empty-traversal symptoms, `trace` from `impact` reaches both `collectImpactDetails` and `buildEmptyImpactDiagnostic`, and the only source-file modification under `src/` is `src/tools/impact.ts`.
