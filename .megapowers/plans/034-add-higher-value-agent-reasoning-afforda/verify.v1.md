## Test Suite Results
Command run fresh:

```bash
bun test
```

Result (from this session):
- `208 pass`
- `0 fail`
- `Ran 208 tests across 93 files. [7.19s]`
- Exit code: `0`

Step 1b (bugfix-only reproduction):
- Not applicable. This issue is a feature implementation request, not a bugfix diagnosis with reproduction steps.

## Per-Criterion Verification

### Criterion 1
> A single shared node-signal layer is the only implementation that computes the role and ranking signals used by `impact`, `symbol_graph`, and `trace`.

**Identify/Run**
- `grep("createSignalComputer|formatRoleTags|formatImpactWhy|fanIn|fanOut", path:"src", glob:"**/*.ts")`
- `read("src/output/signals.ts")`
- `read("src/tools/impact.ts")`
- `read("src/tools/symbol-graph.ts")`
- `read("src/tools/trace.ts")`

**Evidence**
- `src/tools/impact.ts:3` imports `createSignalComputer` and `formatImpactWhy` from `../output/signals.js`.
- `src/tools/symbol-graph.ts:9` imports `createSignalComputer` from `../output/signals.js`.
- `src/tools/trace.ts:3` imports `createSignalComputer` and `formatRoleTags` from `../output/signals.js`.
- Signal computation primitives (`fanIn`, `fanOut`, roles, co-change) are implemented in `src/output/signals.ts` (`24-26`, `95-135`, `154-173`).

**Verdict:** pass

---

### Criterion 2
> Signal computation at tool-render time uses only already-indexed graph data and current graph metadata; it does not invoke tsserver, tree-sitter, ast-grep, git, network calls, or add new dependencies.

**Identify/Run**
- `read("src/output/signals.ts")`
- `grep("tsserver|tree-sitter|ast-grep|git|fetch|http|spawn|exec|Bun\\.spawn", path:"src/output/signals.ts", ignoreCase:true)`

**Evidence**
- `src/output/signals.ts` imports only graph types (`1-2`).
- All computation uses `store.getNode/getNeighbors/getNodesByFile` and local parsing (`95-135`, `154-181`).
- No runtime calls to tsserver/tree-sitter/ast-grep/network/process spawn in this module.

**Verdict:** pass

---

### Criterion 3
> `fanIn` and `fanOut` are counts of distinct inbound/outbound `calls` neighbors (duplicate provenance rows do not increase counts).

**Identify/Run**
- `read("src/output/signals.ts")`
- `read("test/output-signals.test.ts")`
- `bun test` (already run fresh)

**Evidence**
- Distinct counting uses `Set(neighbors.map((neighbor) => neighbor.node.id)).size` in `src/output/signals.ts:24-26`.
- Applied to calls edges in `src/output/signals.ts:154-155`.
- Regression test adds duplicate caller edges then asserts stable fan-in: `test/output-signals.test.ts:129`, `166` (`fanIn === 2`).
- Test passed in fresh suite run.

**Verdict:** pass

---

### Criterion 4
> Role tags: `entry-point` for exported non-module symbols with `fanIn = 0`; `hub` for `fanIn >= 3 && fanOut >= 3`; `leaf` for `fanOut = 0`.

**Identify/Run**
- `read("src/output/signals.ts")`

**Evidence**
- Current implementation does:
  - `if (isExported) roles.push("entry-point")` (`src/output/signals.ts:161`) — no `fanIn===0` check, no non-module check.
  - `if (fanIn >= 2 || fanOut >= 2) roles.push("hub")` (`162`) — threshold and boolean logic differ from required `>=3 && >=3`.
  - `if (fanOut === 0) roles.push("leaf")` (`163`) — this part matches.

**Verdict:** fail

---

### Criterion 5
> Coverage/framework tags: `tested` if at least one `tested_by`, otherwise `untested`; `framework-mediated` when at least one incident edge has provenance source `ast-grep`.

**Identify/Run**
- `read("src/output/signals.ts")`

**Evidence**
- Tested flag: `store.getNeighbors(nodeId, { direction: "out", kind: "tested_by" }).length > 0` (`156`) and formatter emits tested/untested (`188-189`).
- Framework-mediated currently checks only `routes_to`/`renders` edge kinds (`28-35`), not provenance source `ast-grep` on incident edges.

**Verdict:** fail (tested/untested logic present; framework-mediated condition does not match spec)

---

### Criterion 6
> Co-change score from git `co_changes_with`: for non-module symbols use file module node; for impact ranking use highest `co_changes` value to any changed symbol file/module; missing data => `0`.

**Identify/Run**
- `read("src/output/signals.ts")`
- `read("test/output-signals.test.ts")`

**Evidence**
- Module mapping exists (`findModuleNode`, `68-76`; changed module set `78-93`).
- Missing co-change defaults to `0` (`96`, `104-113`).
- Current score is normalized/derived from recency or confidence (`41-55`, `128-130`) and even returns `1` when same module (`115-118`).
- Spec requires highest `co_changes` value for ranking path against changed symbols; implementation does not use raw max `co_changes` as required.

**Verdict:** fail

---

### Criterion 7
> `impact` chain confidence = min hop confidence along selected path; each hop uses highest-confidence `calls` edge between node pairs.

**Identify/Run**
- `read("src/tools/impact.ts")`
- `read("test/tool-impact-ranking.test.ts")`
- `bun test` (already run fresh)

**Evidence**
- Highest-confidence per inbound caller dedupe: `dedupeInboundByStrongestEdge` (`44-53`).
- Chain confidence propagated as weakest-link minimum: `Math.min(current.chainConfidence, neighbor.edge.provenance.confidence)` (`94`).
- Test asserts weakest-link propagation and strongest duplicate-edge hop selection: `test/tool-impact-ranking.test.ts:37`, `56-59`.
- Test passed in fresh suite run.

**Verdict:** pass

---

### Criterion 8
> `impact` ordering: classification (`breaking` before `behavioral`), then higher fanIn, `untested` before `tested`, higher co-change, higher chain confidence, shallower depth, then file/name.

**Identify/Run**
- `read("src/tools/impact.ts")`

**Evidence**
- Current sort order:
  1. classification (`120`)
  2. **depth ascending** (`121`) before fanIn/test/co-change/chain
  3. composite `detailPriority` (`122-123`) where `tested` increases score (`58`) (opposite of required untested-first)
  4. confidence (`124-125`)
  5. file/name (`126`)
- This does not match required deterministic ordering sequence.

**Verdict:** fail

---

### Criterion 9
> Each `impact` line ends with one compact bracketed annotation including role tags, `fan-in:<n>`, coverage tag, `co-change:<n>`, `chain-confidence:<value>`.

**Identify/Run**
- `read("src/tools/impact.ts")`
- `read("src/output/signals.ts")`
- `read("test/tool-impact-output-signals.test.ts")`
- `bun test` (already run fresh)

**Evidence**
- Output line appends `why` suffix inline: `src/tools/impact.ts:172-173`.
- `formatImpactWhy` includes `roles`, `fan-in`, coverage (`tested/untested`), `co-change`, `chain-confidence` (`192-199`).
- Regression assertion checks exact one-line bracket suffix with `chain-confidence`: `test/tool-impact-output-signals.test.ts:29`.
- Test passed in fresh suite run.

**Verdict:** pass

---

### Criterion 10
> `symbol_graph` preserves current header/section layout and appends compact bracketed role tags to resolved header anchor line and each resolved neighbor; unresolved rows unchanged.

**Identify/Run**
- `read("src/tools/symbol-graph.ts")`
- `read("src/output/anchoring.ts")`
- `read("test/tool-symbol-graph-signals.test.ts")`
- `bun test` (already run fresh)

**Evidence**
- Header signal tags appended in `formatNeighborhood`: `src/output/anchoring.ts:121-123`.
- Neighbor line tags appended only when `item.signals` present: `100-103`.
- `symbol_graph` passes signals for callers/callees/imports (`108-110`) but not unresolved (`111`), preserving unresolved rows.
- Test validates header + resolved neighbor inline tags: `test/tool-symbol-graph-signals.test.ts:51-52`.
- Test passed in fresh suite run.

**Verdict:** pass

---

### Criterion 11
> `trace` preserves `mode:` header and step ordering, appends compact bracketed role tags to each rendered step line.

**Identify/Run**
- `read("src/tools/trace.ts")`
- `read("test/tool-trace-signals.test.ts")`
- `bun test` (already run fresh)

**Evidence**
- Coverage steps keep ordinal ordering: `src/tools/trace.ts:110-112`.
- Mode header preserved via `formatModeHeader` (`87-92`) and output assembly (`114`, `119`).
- Step lines append `formatRoleTags(...)` in both stored/live modes (`67-70`, `83-84`).
- Test asserts unchanged mode header and tagged step lines: `test/tool-trace-signals.test.ts:53-55`.
- Test passed in fresh suite run.

**Verdict:** pass

---

### Criterion 12
> Signal annotations are always on, no new parameter, inline suffixes.

**Identify/Run**
- `read("src/tools/impact.ts")`
- `read("src/tools/symbol-graph.ts")`
- `read("src/tools/trace.ts")`

**Evidence**
- `impact` unconditionally creates signalComputer (`158`) and appends inline suffix (`173`).
- `symbol_graph` unconditionally creates signalComputer (`82`) and passes signals to renderer (`108-110`, `114`).
- `trace` unconditionally creates signalComputer (`105`) and appends tags in step-line formatters (`69`, `84`).
- No new params added for toggling annotations.

**Verdict:** pass

---

### Criterion 13
> Regression tests cover the specified signal semantics + additive preservation behaviors.

**Identify/Run**
- `bun test` (fresh full run)
- `read("test/output-signals.test.ts")`
- `read("test/tool-impact-ranking.test.ts")`
- `read("test/tool-impact-output-signals.test.ts")`
- `read("test/tool-symbol-graph-signals.test.ts")`
- `read("test/tool-trace-signals.test.ts")`

**Evidence**
- Relevant tests exist and pass (`tool-impact-ranking`, `tool-impact-output-signals`, `tool-symbol-graph-signals`, `tool-trace-signals`, `tool-impact-performance`).
- However, core semantic expectations in tests diverge from this spec:
  - `test/output-signals.test.ts:168` expects `hub` at fanIn/fanOut = 2 (not >=3 && >=3).
  - `src/output/signals.ts:161-162` and matching tests do not enforce `entry-point` requiring `fanIn=0` and non-module.
  - `framework-mediated` is tied to edge kinds, not ast-grep provenance (`src/output/signals.ts:28-35`).
- Therefore regression coverage for the required semantics is incomplete/misaligned.

**Verdict:** fail

---

### Criterion 14
> Performance regression test with in-memory store and >=100 impacted symbols completes within 1s.

**Identify/Run**
- `read("test/tool-impact-performance.test.ts")`
- `bun test` (fresh full run)

**Evidence**
- Test creates 120 dependents and asserts `<1000ms`: `test/tool-impact-performance.test.ts:9`, `24-25`, `58`.
- Fresh suite output: `(pass) impact renders 120 annotated dependents under one second [19.83ms]`.

**Verdict:** pass

## Overall Verdict
**fail**

The implementation is partially complete, but it does not satisfy multiple spec-critical criteria (AC 4, 5, 6, 8, 13). The largest gaps are role-tag rules, framework-mediated detection semantics, co-change scoring semantics, and impact ordering semantics.

### Recommended Next Steps
1. Update `src/output/signals.ts` role logic to match exact thresholds/conditions:
   - `entry-point`: exported AND non-module AND `fanIn === 0`
   - `hub`: `fanIn >= 3 && fanOut >= 3`
2. Rework framework-mediated detection to use incident-edge provenance `source === "ast-grep"`.
3. Rework co-change score to use highest raw `co_changes` value across candidate module ↔ changed modules (with `0` default when missing).
4. Rework `impact` sort comparator to the required deterministic key order (classification, fanIn desc, untested first, co-change desc, chain-confidence desc, depth asc, file/name).
5. Update/add regression tests to assert the exact required semantics above.
6. Re-run full suite and re-verify all criteria.