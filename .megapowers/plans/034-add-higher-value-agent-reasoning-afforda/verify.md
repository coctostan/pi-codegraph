## Test Suite Results
Command run fresh in this verification session:

```bash
bun test
```

Observed result:
- `209 pass`
- `0 fail`
- `639 expect() calls`
- `Ran 209 tests across 93 files. [7.29s]`
- Exit code: `0`

Step 1b (bugfix-only reproduction): Not applicable (this issue is feature work, not a bugfix with reproduction steps).

## Per-Criterion Verification

### Criterion 1
**Text:** A single shared node-signal layer is the only implementation that computes the role and ranking signals used by `impact`, `symbol_graph`, and `trace`.

**Evidence (identify/run):**
- `read("src/output/signals.ts")`
- `read("src/tools/impact.ts")`
- `read("src/tools/symbol-graph.ts")`
- `read("src/tools/trace.ts")`
- `grep("createSignalComputer\\(|formatRoleTags\\(|formatImpactWhy\\(", path:"src", glob:"**/*.ts")`

**Read/verify:**
- Shared signal computation is implemented in `src/output/signals.ts` (`createSignalComputer`, lines `48-168`).
- `impact` imports/uses shared layer (`src/tools/impact.ts:3`, `90`, `158`, `172`).
- `symbol_graph` imports/uses shared layer (`src/tools/symbol-graph.ts:9`, `82`, `108-110`, `114`).
- `trace` imports/uses shared layer (`src/tools/trace.ts:3`, `105`, `67`, `83`).

**Verdict:** pass

---

### Criterion 2
**Text:** Signal computation at tool-render time uses only indexed graph data/metadata; no tsserver/tree-sitter/ast-grep/git/network/deps.

**Evidence (identify/run):**
- `read("src/output/signals.ts")`
- `grep("tsserver|tree-sitter|ast-grep|git\\.|spawn|exec|fetch|http|https|Bun\\.spawn|child_process", path:"src/output/signals.ts", ignoreCase:true)`

**Read/verify:**
- `signals.ts` only imports graph types (`lines 1-2`) and uses `store.getNode/getNeighbors/getNodesByFile` (`54-117`, `137-141`).
- No process/network calls in `signals.ts`.
- Only `ast-grep` usage is provenance-source string comparison (`line 29`), not invoking ast-grep tooling.

**Verdict:** pass

---

### Criterion 3
**Text:** `fanIn`/`fanOut` count distinct `calls` neighbors (duplicates do not inflate counts).

**Evidence (identify/run):**
- `read("src/output/signals.ts")`
- `read("test/output-signals.test.ts")`
- fresh `bun test` output includes `(pass) createSignalComputer computes AC-aligned fan-in/out...`

**Read/verify:**
- Distinct counting via `Set(neighbor.node.id)` in `uniqueNeighborCount` (`src/output/signals.ts:24-26`).
- Applied specifically to inbound/outbound `calls` (`137-138`).
- Duplicate provenance rows explicitly tested (`test/output-signals.test.ts:154`), and expected fan-in asserted (`187`).

**Verdict:** pass

---

### Criterion 4
**Text:** Roles: `entry-point` (exported non-module with `fanIn=0`), `hub` (`fanIn>=3 && fanOut>=3`), `leaf` (`fanOut=0`).

**Evidence (identify/run):**
- `read("src/output/signals.ts")`
- `read("test/output-signals.test.ts")`

**Read/verify:**
- `entry-point` rule: `isExported && node.kind !== "module" && fanIn === 0` (`src/output/signals.ts:144`).
- `hub` rule: `fanIn >= 3 && fanOut >= 3` (`145`).
- `leaf` rule: `fanOut === 0` (`146`).
- Regression assertions cover these semantics (`test/output-signals.test.ts:189`, `194`, `197`, `203`).

**Verdict:** pass

---

### Criterion 5
**Text:** `tested`/`untested` from `tested_by`; `framework-mediated` from incident `ast-grep` provenance edges.

**Evidence (identify/run):**
- `read("src/output/signals.ts")`
- `read("test/output-signals.test.ts")`

**Read/verify:**
- Tested flag: out-neighbors of `tested_by` (`src/output/signals.ts:139`), with formatter emitting tested/untested (`171-172`, `181`).
- Framework-mediated: `store.getNeighbors(nodeId).some(...source === "ast-grep")` (`29`).
- Test injects ast-grep-provenance incident call edge (`test/output-signals.test.ts:156`) and expects framework-mediated role/flag (`189`, `191`).

**Verdict:** pass

---

### Criterion 6
**Text:** Co-change score uses module-level `co_changes_with`; non-modules map to same-file module; for impact changed symbols uses highest `co_changes`; missing data => `0`.

**Evidence (identify/run):**
- `read("src/output/signals.ts")`
- `read("test/output-signals.test.ts")`

**Read/verify:**
- Non-module to module mapping by file (`findModuleNode`, `54-62`).
- Changed symbols mapped to changed modules (`64-79`).
- Score derived from incident `co_changes_with` edges (`103-106`) and highest parsed `co_changes` (`111-114`).
- Missing data returns `0` (`82`, `90-99`).
- Regression test asserts module-level derivation to score `7` (`test/output-signals.test.ts:178`, `206`).

**Verdict:** pass

---

### Criterion 7
**Text:** `impact` chain confidence is min hop confidence on selected path, each hop using highest-confidence `calls` edge between pair.

**Evidence (identify/run):**
- `read("src/tools/impact.ts")`
- `read("test/tool-impact-ranking.test.ts")`
- fresh `bun test` output includes `(pass) collectImpactDetails ranks dependents and carries weakest-link chain confidence`

**Read/verify:**
- Per-hop strongest edge selected in `dedupeInboundByStrongestEdge` (`44-53`).
- Chain confidence propagated as minimum (`102`).
- Test includes duplicate pair with different confidences and asserts weakest-link chain values (`test/tool-impact-ranking.test.ts:37`, `56-59`).

**Verdict:** pass

---

### Criterion 8
**Text:** `impact` ordering: breaking before behavioral, fanIn desc, untested before tested, co-change desc, chain-confidence desc, depth asc, file/name.

**Evidence (identify/run):**
- `read("src/tools/impact.ts")`
- `read("test/tool-impact-ranking.test.ts")`
- fresh `bun test` output includes both ranking tests passing

**Read/verify:**
- Comparator order exactly implemented in `compareDetails`:
  - classification (`56`)
  - fanIn (`58`)
  - untested first (`60`)
  - co-change (`62-64`)
  - chain confidence (`66`)
  - depth (`68`)
  - file/name (`70`)
- Ranking behavior and untested-before-tested precedence both asserted (`test/tool-impact-ranking.test.ts:48`, `95`).

**Verdict:** pass

---

### Criterion 9
**Text:** Every `impact` line ends with compact bracketed annotation with role tags, fan-in, coverage, co-change, chain-confidence.

**Evidence (identify/run):**
- `read("src/tools/impact.ts")`
- `read("src/output/signals.ts")`
- `read("test/tool-impact-output-signals.test.ts")`
- `read("test/extension-impact.test.ts")`

**Read/verify:**
- `impact` appends `formatImpactWhy(...)` inline (`src/tools/impact.ts:172-173`).
- `formatImpactWhy` includes `fan-in`, `roles`, `coverage`, `co-change`, optional `chain-confidence` (`src/output/signals.ts:175-182`).
- Exact regex check for full bracketed suffix including chain-confidence (`test/tool-impact-output-signals.test.ts:29`).
- Extension test preserves anchor/classification/depth contract with annotation suffix (`test/extension-impact.test.ts:48-50`).

**Verdict:** pass

---

### Criterion 10
**Text:** `symbol_graph` keeps header/sections layout, adds compact role tags to resolved header and resolved neighbors; unresolved unchanged.

**Evidence (identify/run):**
- `read("src/tools/symbol-graph.ts")`
- `read("src/output/anchoring.ts")`
- `read("test/tool-symbol-graph-signals.test.ts")`
- `read("test/output-format-neighborhood.test.ts")`

**Read/verify:**
- Header role tags appended inline (`src/output/anchoring.ts:121-123`).
- Neighbor tags appended only when `signals` present (`100-103`).
- `symbol_graph` supplies signals for resolved callers/callees/imports (`108-110`) and omits signals for unresolved (`111`).
- Signal rendering validated (`test/tool-symbol-graph-signals.test.ts:51-52`).
- Existing layout/stale/unresolved behavior validated by format tests (`test/output-format-neighborhood.test.ts:13`, `114`, `159`).

**Verdict:** pass

---

### Criterion 11
**Text:** `trace` preserves `mode:` header and step ordering, adds compact role tags to each step line.

**Evidence (identify/run):**
- `read("src/tools/trace.ts")`
- `read("test/tool-trace-signals.test.ts")`
- `read("test/tool-trace-static-mode-header.test.ts")`

**Read/verify:**
- Coverage steps sorted by ordinal (`src/tools/trace.ts:110-112`).
- Mode header preserved via `formatModeHeader` and output composition (`87-92`, `114`, `119`).
- Step tags appended in both stored/live formatters (`69`, `84`).
- Tests assert unchanged mode header and tagged step lines (`test/tool-trace-signals.test.ts:53-55`; `test/tool-trace-static-mode-header.test.ts:65`).

**Verdict:** pass

---

### Criterion 12
**Text:** Signal annotations are always on, no new parameters, inline suffixes.

**Evidence (identify/run):**
- `read("src/tools/impact.ts")`
- `read("src/tools/symbol-graph.ts")`
- `read("src/tools/trace.ts")`

**Read/verify:**
- `impact` always creates signal computer and appends suffix (`158`, `172-173`), no toggle param.
- `symbol_graph` always creates signal computer and renders inline tags via shared formatter path (`82`, `108-114`).
- `trace` always creates signal computer and appends inline tags (`105`, `67-69`, `83-84`).

**Verdict:** pass

---

### Criterion 13
**Text:** Regression coverage includes role/counter/co-change/chain/ranking/annotations/symbol_graph tags/trace tags/additive preservation.

**Evidence (identify/run):**
- fresh `bun test` full run
- `read("test/output-signals.test.ts")`
- `read("test/tool-impact-ranking.test.ts")`
- `read("test/tool-impact-output-signals.test.ts")`
- `read("test/tool-symbol-graph-signals.test.ts")`
- `read("test/tool-trace-signals.test.ts")`
- `read("test/extension-impact.test.ts")`
- `read("test/output-format-neighborhood.test.ts")`
- `read("test/tool-trace-static-mode-header.test.ts")`

**Read/verify:**
- Entry-point exported vs non-module/conditions: `test/output-signals.test.ts:194`, `200-203`.
- Hub/leaf/tested/untested/framework-mediated: `189-191`, `197-198`.
- Fan-in/out duplicate dedupe: duplicate edge setup `154`, assert `187-188`.
- Co-change derivation from module git edge: `171-179`, assert `206`.
- Chain confidence: `test/tool-impact-ranking.test.ts:37`, `56-59`.
- Impact ranking order incl untested-vs-tested: `48`, `95`.
- Impact annotations: `test/tool-impact-output-signals.test.ts:29` and extension regex `test/extension-impact.test.ts:48-50`.
- Symbol graph tags: `test/tool-symbol-graph-signals.test.ts:51-52`.
- Trace tags + mode/header ordering preservation: `test/tool-trace-signals.test.ts:53-55`, `test/tool-trace-static-mode-header.test.ts:65`.
- Additive stale/header/unresolved preservation: `test/output-format-neighborhood.test.ts:114`, `159`; extension output contract `48-50`.

**Verdict:** pass

---

### Criterion 14
**Text:** Performance regression test with >=100 impacted symbols verifies `impact` annotated output under 1 second.

**Evidence (identify/run):**
- `read("test/tool-impact-performance.test.ts")`
- fresh `bun test` output contains `(pass) impact renders 120 annotated dependents under one second [18.58ms]`

**Read/verify:**
- Test constructs 120 impacted symbols (`test/tool-impact-performance.test.ts:14-16`, `24-25`) and asserts `<1000ms` (`58`).
- Full suite run passed this test in this session.

**Verdict:** pass

## Overall Verdict
**pass**

All acceptance criteria (1-14) are satisfied by current implementation and verified with fresh command output plus code/test inspection evidence from this session.