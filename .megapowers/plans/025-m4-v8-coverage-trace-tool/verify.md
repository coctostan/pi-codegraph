# Verification Report — 025-m4-v8-coverage-trace-tool

## Test Suite Results

```
bun test v1.3.9 (cf6cdbbb)
 136 pass
 0 fail
 433 expect() calls
Ran 136 tests across 39 files. [4.60s]
```

TypeScript type check: `bun run check` → exit 0, no errors.

Feature-specific tests (9 files, 12 tests): all pass.

## Per-Criterion Verification

### Criterion 1: Stage 4 indexing reads one or more V8 coverage JSON files from the configured coverage input location.
**Evidence:** `parseCoverageReports()` in `src/indexer/coverage.ts:37-107` reads all `.json` files from `coverageDir` via `readdirSync`. `runCoverageIndexStage()` calls it at line 145. Pipeline wires it at `src/indexer/pipeline.ts:108` with configurable `coverageDir`. Test `indexer-coverage-parser.test.ts` writes two report files (`a-report.json`, `b-report.json`) and verifies both are read. Test `indexer-coverage-stage.test.ts` writes one `report.json` and verifies edges are created from it.
**Verdict:** pass

### Criterion 2: Stage 4 indexing ignores coverage entries whose URLs do not resolve to project-local `.ts` or `.tsx` source files.
**Evidence:** `isProjectLocalTsFile()` at line 30-35 checks both that the file is under `projectRoot` and ends with `.ts`/`.tsx`. `parseCoverageReports()` skips non-`file://` URLs (line 61) and non-absolute paths. Test asserts `ignoredJs` (`.js` file) and `external` (`https://` URL) are excluded (lines 106-107).
**Verdict:** pass

### Criterion 3: Stage 4 indexing produces a deterministic normalized coverage record order for the same input files across repeated runs.
**Evidence:** `parseCoverageReports()` sorts file names alphabetically (line 43), then sorts output records by `reportFile`, `file`, `functionName`, `startLine`, `endLine` (lines 100-106). Test runs `parseCoverageReports` twice and asserts `first` and `second` produce identical output (lines 104-105).
**Verdict:** pass

### Criterion 4: Stage 4 indexing skips malformed coverage entries without aborting the full indexing run.
**Evidence:** `parseCoverageReports()` wraps JSON.parse in try/catch with `continue` (lines 47-51). Per-entry processing also has try/catch (lines 54, 94-96). Test writes `c-malformed.json` with invalid JSON and a report with `functions: "not-an-array"` — both are skipped, valid records still returned (line 104 assertion passes).
**Verdict:** pass

### Criterion 5: Coverage mapping resolves a coverage range to an existing graph node only when the node is in the same project-local file and its line range overlaps the covered range.
**Evidence:** `mapCoverageToNodes()` at line 122-142 calls `store.getNodesByFile(record.file)` to get same-file nodes, then filters by `overlaps()` (line 128) which checks line range overlap. Test `indexer-coverage-mapping.test.ts` verifies `inner` (lines 3-5) matches a record spanning lines 3-5, while `outer` (lines 1-10) is not selected (smallest span wins).
**Verdict:** pass

### Criterion 6: Coverage mapping does not create any graph edge or stored trace step for a coverage range that cannot be resolved to an existing graph node.
**Evidence:** `mapCoverageToNodes()` line 132: `if (!resolved) continue;` — unresolved records are dropped. Test `indexer-coverage-mapping.test.ts` includes a record for `src/missing.ts::ghost` which has no graph nodes; the mapped result has length 2 (not 3). Test `indexer-coverage-stage.test.ts` only creates nodes for known files — no edges for unresolvable coverage.
**Verdict:** pass

### Criterion 7: When a covered production symbol and a covering test symbol are both resolved, indexing persists a `tested_by` edge from the production symbol to the test symbol.
**Evidence:** `runCoverageIndexStage()` at lines 165-178 calls `store.addEdge()` with `kind: "tested_by"`, `source: prodRecord.node.id`, `target: testRecord.node.id`. Test `indexer-coverage-stage.test.ts` asserts `testedBy` has length 1 and `testedBy[0].node.id === testNode.id`.
**Verdict:** pass

### Criterion 8: A `tested_by` edge created from coverage is persisted with provenance source `coverage`.
**Evidence:** `runCoverageIndexStage()` line 172: `source: "coverage"`. Test `indexer-coverage-stage.test.ts` asserts `testedBy[0].edge.provenance.source === "coverage"`.
**Verdict:** pass

### Criterion 9: For each resolved test symbol, indexing persists one deterministic ordered symbol sequence that can be used later as the backing trace for that test.
**Evidence:** `runCoverageIndexStage()` lines 181-192 builds a `TestTraceRecord` with ordinals (test at 0, production sorted deterministically). `store.saveTestTrace(trace)` persists it. Test `indexer-coverage-stage.test.ts` asserts `store.getTestTrace(testNode.id)` returns the expected ordered steps with ordinals 0, 1, 2.
**Verdict:** pass

### Criterion 10: Re-running coverage indexing with unchanged source content and unchanged coverage input does not create duplicate `tested_by` edges for the same production/test symbol pair.
**Evidence:** `store.addEdge()` uses `INSERT OR REPLACE` with primary key `(source, target, kind, provenance_source)` in `src/graph/sqlite.ts`. Test `indexer-coverage-stage.test.ts` ("does not duplicate tested_by edges on rerun") runs `indexProject` twice and asserts `testedByAgain` has length 1.
**Verdict:** pass

### Criterion 11: Persisted coverage-backed trace artifacts store enough source-content identity to determine whether they are stale after relevant files change.
**Evidence:** `test_trace_steps` table stores `content_hash` per step (sqlite.ts line 209). `runCoverageIndexStage()` stores `record.node.content_hash` as step `contentHash` (lines 184, 188). `formatStoredTraceLine()` in trace.ts compares `node.content_hash !== storedHash` (line 64) to detect staleness.
**Verdict:** pass

### Criterion 12: When `trace` is called with a test symbol that has a stored coverage-backed trace, it returns that stored ordered symbol sequence.
**Evidence:** `trace()` line 29: `if (node.kind === "test") return node.id` → directly looks up the test's trace. Lines 84-88 render stored steps in ordinal order. Test `tool-trace-coverage.test.ts` asserts `direct` output contains `mode: coverage` and all three step anchors in order.
**Verdict:** pass

### Criterion 13: When `trace` is called with a production symbol covered by more than one stored test trace, it returns exactly one trace chosen by a deterministic selection rule.
**Evidence:** `pickCoverageTraceForNode()` sorts covering tests by `a.node.id.localeCompare(b.node.id)` (line 18) and returns the first match. Test `tool-trace-coverage.test.ts` sets up `alphaTest` and `betaTest` both covering `prod`; asserts `byProd` contains `alphaTest` (alphabetically first) and does NOT contain `betaTest`.
**Verdict:** pass

### Criterion 14: When `trace` is called with an endpoint that already resolves through existing route relationships to a covered symbol, it returns the same deterministic coverage-backed trace selection used for a production symbol.
**Evidence:** `resolveCoverageTraceId()` lines 30-37: for endpoint kind, follows `routes_to` edges to handlers, then calls `pickCoverageTraceForNode()`. Test `tool-trace-endpoint.test.ts` sets up endpoint → handler via `routes_to`, handler → test via `tested_by`, and a stored trace. Asserts output contains `mode: coverage`, `usersTest`, `handler`, `service`.
**Verdict:** pass

### Criterion 15: When no coverage-backed trace can be resolved for the requested entry point, `trace` falls back to a deterministic static graph traversal result.
**Evidence:** `trace()` lines 92-93: when no coverage trace found, calls `buildStaticTrace()` which follows `calls` edges deterministically (sorted by file, start_line, id). Returns `mode: static`. Test `tool-trace-static-fallback.test.ts` sets up call chain with no coverage; asserts output contains `mode: static`, `entry`, `first`, `second`.
**Verdict:** pass

### Criterion 16: When a stored coverage-backed trace resolves but its stored source-content identity no longer matches current source content, `trace` still returns the trace and marks it as stale.
**Evidence:** `formatStoredTraceLine()` lines 58-69: compares `node.content_hash !== storedHash` and appends `[stale]`. Line 87-88: if any step is stale, header becomes `mode: coverage [stale]`. Test `tool-trace-stale.test.ts` stores trace with `old-app-hash` but node has `old-test-hash` — asserts output contains `mode: coverage [stale]` and `[stale]` markers.
**Verdict:** pass

### Criterion 17: `trace` output includes hashline anchors for every returned symbol step that can be anchored to current file content.
**Evidence:** Both `formatStoredTraceLine()` (line 63) and `formatLiveTraceLine()` (line 74) call `computeAnchor(node, projectRoot)` which produces `file:line:hash` anchors. Test `tool-trace-coverage.test.ts` asserts output contains `src/app.test.ts:1:` and `src/app.ts:1:` (anchor prefixes).
**Verdict:** pass

### Criterion 18: If a returned trace step cannot be anchored because the current file content no longer matches the stored location, `trace` marks that step as stale or unresolved instead of failing the whole trace request.
**Evidence:** `formatStoredTraceLine()` lines 60-62: if node not found in store, returns `${nodeId}  unresolved [stale]`. Test `tool-trace-stale.test.ts` includes step for `src/app.ts::removed:9` (no node in store) and asserts output contains `src/app.ts::removed:9  unresolved [stale]`. The trace still returns successfully with other steps.
**Verdict:** pass

### Criterion 19: `trace` returns one trace only for a request in v1 and does not return multiple candidate traces.
**Evidence:** `trace()` returns a single string with one `mode:` header and one ordered sequence. `pickCoverageTraceForNode()` returns the first matching trace ID. `buildStaticTrace()` follows one path. Test `tool-trace-coverage.test.ts` verifies only `alphaTest` appears (not `betaTest`). Extension wiring in `src/index.ts:172-184` registers a single `trace` tool that returns one result.
**Verdict:** pass

## Overall Verdict
**pass**

All 19 acceptance criteria are met with direct evidence from passing tests (136/136, 0 failures), type checking (exit 0), and code inspection. The implementation covers V8 coverage parsing, node mapping, trace persistence, coverage-backed trace retrieval, endpoint resolution, static fallback, stale marking, and extension wiring.
