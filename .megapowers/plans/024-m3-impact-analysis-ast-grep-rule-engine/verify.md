# Verification Report
## Issue: 024-m3-impact-analysis-ast-grep-rule-engine
## Date: 2026-03-07

---

## Test Suite Results

```
bun test v1.3.9 (cf6cdbbb)

 125 pass
 0 fail
 394 expect() calls
Ran 125 tests across 31 files. [4.54s]
```

TypeScript type check: `bun run check` exits 0 (no errors).

---

## Per-Criterion Verification

### Criterion 1: impact tool accepts symbols, changeType, optional maxDepth
**Evidence:** `src/tools/impact.ts` exports `collectImpact({ symbols, changeType, store, maxDepth? })` and `impact({ symbols, changeType, store, projectRoot, maxDepth? })`. Extension registers tool with schema properties `symbols`, `changeType`, `maxDepth` (verified by `test/extension-impact.test.ts`: `'pi extension default export registers tool name "impact" with symbols/changeType schema'`).
**Verdict:** pass

### Criterion 2: traverses inbound `calls` edges, returns dependents within maxDepth
**Evidence:** `collectImpact` BFS calls `store.getNeighbors(current.id, { direction: "in", kind: "calls" })`. Test `collectImpact classifies direct and transitive dependents by change type` (tool-impact.test.ts): shared→a (depth 1) and a→b (depth 2) both returned. Test passes (125/125).
**Verdict:** pass

### Criterion 3: includes traversal depth for every returned dependent
**Evidence:** `ImpactItem` interface has `depth: number`. Results in test include `depth: 1` and `depth: 2`. Impact output format includes `depth:${hit.depth}`. Verified by `extension-impact.test.ts` regex `depth:1`.
**Verdict:** pass

### Criterion 4: signature_change depth 1 → breaking
**Evidence:** `classify("signature_change", 1)` returns `"breaking"`. Test `collectImpact classification matrix (AC 34)` asserts `[{ classification: "breaking" }]` for depth 1. Test passes.
**Verdict:** pass

### Criterion 5: signature_change depth > 1 → behavioral
**Evidence:** Same `classify` function: `depth === 1 ? "breaking" : "behavioral"`. Test asserts `["breaking", "behavioral"]` for depths 1 and 2 with `signature_change`.
**Verdict:** pass

### Criterion 6: removal depth 1 → breaking
**Evidence:** `classify("removal", 1)` returns `"breaking"`. Test `collectImpact classifies direct and transitive dependents by change type` asserts `removal.map(item => item.classification)` equals `["breaking", "behavioral"]`.
**Verdict:** pass

### Criterion 7: removal depth > 1 → behavioral
**Evidence:** Same test as AC 6 — depth 2 classified `"behavioral"` for `removal`.
**Verdict:** pass

### Criterion 8: behavior_change → all behavioral regardless of depth
**Evidence:** `classify("behavior_change", depth)` always returns `"behavioral"`. Test matrix and transitive test both assert `["behavioral", "behavioral"]` for depths 1 and 2.
**Verdict:** pass

### Criterion 9: addition → no dependents, no traversal
**Evidence:** `if (changeType === "addition") return [];` — returns immediately. Three separate tests verify: `collectImpact returns no dependents for addition`, `collectImpact respects maxDepth` (addition branch), and classification matrix. All pass.
**Verdict:** pass

### Criterion 10: terminates on cyclic graphs without duplicate dependents
**Evidence:** `seen = new Set<string>()` gates every node before enqueue. Two cycle tests: `collectImpact terminates on cycles without duplicates` (2-node mutual cycle) and `collectImpact terminates on a 3-node cycle without duplicates` (3-node cycle). Both pass with exactly the expected unique set of nodes.
**Verdict:** pass

### Criterion 11: every impact result anchored to current file content
**Evidence:** `impact()` calls `computeAnchor(node, params.projectRoot)` for each hit. `extension-impact.test.ts` test `impact() emits anchored structured lines` verifies output matches `^src/caller.ts:2:[0-9a-f]{4}  caller  breaking  depth:1` and the full format `^…\n$` (trailing newline, two-space separators).
**Verdict:** pass

### Criterion 12: graph schema supports `endpoint` nodes
**Evidence:** `src/graph/types.ts` line 6: `"endpoint"` is in the `NodeKind` union. `tsc --noEmit` exits 0. Test `applyRuleMatches creates endpoint nodes and routes_to edges` checks `endpoint.kind === "endpoint"`.
**Verdict:** pass

### Criterion 13: graph schema supports `routes_to` edges
**Evidence:** `src/graph/types.ts` line 17: `"routes_to"` in `EdgeKind` union. Used by `applyRoutesToMatches`. Tests verify routes_to edges are created and retrievable.
**Verdict:** pass

### Criterion 14: graph schema supports `renders` edges
**Evidence:** `src/graph/types.ts` line 16: `"renders"` in `EdgeKind` union. Test `applyRuleMatches emits renders from smallest containing function` checks `nested[0]!.edge.kind === "renders"`.
**Verdict:** pass

### Criterion 15: graph schema supports `ast-grep` as provenance source
**Evidence:** `src/graph/types.ts` line 22: `"ast-grep"` in `ProvenanceSource` union. Both `applyRoutesToMatches` and `applyRendersMatches` set `provenance.source = "ast-grep"`. Integration tests assert `routes.every(r => r.edge.provenance.source === "ast-grep")`.
**Verdict:** pass

### Criterion 16: Stage 3 indexer loads bundled rules from `src/rules/`
**Evidence:** `runAstGrepIndexStage` constructs `bundledDir = fileURLToPath(new URL("../rules/", import.meta.url))` and passes it to `loadRules`. Test `bundled rules path resolves and bundled files exist` asserts `express.yaml` and `react.yaml` exist in that path.
**Verdict:** pass

### Criterion 17: loads user-defined rules from `.codegraph/rules/*.yaml`
**Evidence:** `loadRules` constructs `userDir = join(options.projectRoot, ".codegraph", "rules")` and merges files from both dirs. Test `loadRules merges bundled + project-local rules` creates a tmp `.codegraph/rules/generic.yaml` and verifies it's in the merged rule set.
**Verdict:** pass

### Criterion 18: rule can declare edge source using `from_capture`
**Evidence:** `AstGrepRule.produces.from_capture?: string` field. Express bundled rule uses `from_capture: HANDLERS`. `applyRoutesToMatches` reads `from_capture`. Test `applyRuleMatches creates endpoint nodes and routes_to edges` uses it.
**Verdict:** pass

### Criterion 19: rule can declare edge source using `from_context: enclosing_function`
**Evidence:** `AstGrepRule.produces.from_context?: "enclosing_function"` field. React bundled rule uses `from_context: enclosing_function`. `applyRendersMatches` calls `smallestContainingFunction` for this case.
**Verdict:** pass

### Criterion 20: rule can declare edge target using `to_capture`
**Evidence:** `AstGrepRule.produces.to_capture?: string`. React rule uses `to_capture: COMPONENT`. `applyRendersMatches` calls `metaValue(match.metaVariables, rule.produces.to_capture)`.
**Verdict:** pass

### Criterion 21: rule can declare edge target using `to_template`
**Evidence:** `AstGrepRule.produces.to_template?: string`. Express rule uses `to_template: endpoint:{METHOD}:{PATH}`. `renderTemplate()` expands it. Test verifies `endpoint:GET:/users` is created.
**Verdict:** pass

### Criterion 22: invalid rule files rejected with specific error identifying file
**Evidence:** `validateRuleFile` throws `Error("Invalid rule file ${filePath}: …")` for missing fields, wrong field combos, unsupported context values. YAML parse errors are wrapped with `Error("Invalid rule file ${filePath}: ${message}")`. Six separate tests in `indexer-ast-grep-rules.test.ts` verify these paths with exact file path in message. All pass.
**Verdict:** pass

### Criterion 23: invokes ast-grep through `sg` subprocess, not native binding
**Evidence:** No `@ast-grep/napi` or any in-process binding anywhere in `src/` or `package.json` (grep returned no results). `defaultExec` in `ast-grep.ts` uses `Bun.spawn(["sg", "run", …])`. `runScan` test verifies CLI args: `["sg", "run", "--json", "--lang", …]`.
**Verdict:** pass

### Criterion 24: Stage 3 can scan only changed files
**Evidence:** `runAstGrepIndexStage` receives `files: string[]` parameter (the `changedFiles` list from `pipeline.ts`). Test `runAstGrepIndexStage passes only changed files to scanFn` verifies empty call list when no files provided; test `runAstGrepIndexStage passes exactly provided changed files to scanFn` verifies exact file list forwarded.
**Verdict:** pass

### Criterion 25: before rescanning, removes existing ast-grep edges for changed file
**Evidence:** In `pipeline.ts`, when `existing !== null` (hash changed), `store.deleteFile(rel)` is called before adding new nodes or running ast-grep. `SqliteGraphStore.deleteFile` (lines 352-377) executes: `DELETE FROM edges WHERE provenance_source != 'agent' AND (source IN … OR target IN …)` — removes all ast-grep edges. Then tree-sitter + ast-grep re-populate.
**Verdict:** pass

### Criterion 26: re-indexing unchanged file set does not create duplicate ast-grep edges
**Evidence:** Unchanged files (hash unchanged) are in `skipped` path and not added to `changedFiles`. `runAstGrepIndexStage` only receives `changedFiles`, so unchanged files are never re-scanned. Integration test `pipeline Stage 3 indexes express routes…` verifies: after second run on unchanged file, `routes.length === edgeCountBeforeUnchanged` (still 1), `Set` of `source->target` strings has size 1.
**Verdict:** pass

### Criterion 27: bundled Express rule creates endpoint node for matched route
**Evidence:** `applyRoutesToMatches` creates a `GraphNode` with `kind: "endpoint"` and calls `store.addNode(endpointNode)`. Integration test asserts `store.getNode("endpoint:GET:/users")` is defined after indexing Express fixture.
**Verdict:** pass

### Criterion 28: Express endpoint node IDs use format `endpoint:{METHOD}:{path}`
**Evidence:** `to_template: endpoint:{METHOD}:{PATH}` in `src/rules/express.yaml`. `renderTemplate` expands it. `rawMethod.toUpperCase()` ensures uppercase METHOD. PATH has quotes stripped via `replace(/^['"]|['"]$/g, "")`. Unit test asserts `endpoint.id` matches `/^endpoint:[A-Z]+:\/users$/`. Integration test asserts `store.getNode("endpoint:GET:/users")`.
**Verdict:** pass

### Criterion 29: Express rule creates `routes_to` edge from handler to endpoint node
**Evidence:** `applyRoutesToMatches` calls `store.addEdge({ source: handlerNode.id, target: endpointId, kind: "routes_to", … })`. Integration test asserts `routes.map(r => r.node.id)` equals `["endpoint:GET:/users"]`.
**Verdict:** pass

### Criterion 30: React render rule creates `renders` edge from enclosing function to rendered component
**Evidence:** `applyRendersMatches` calls `store.addEdge({ source: sourceNode.id, target: targetNode.id, kind: "renders", … })` where `sourceNode` is the enclosing function. Integration test asserts `renders[0].node.name === "Button"` and `renders[0].edge.kind === "renders"` (implicit from `getNeighbors` with `kind: "renders"`).
**Verdict:** pass

### Criterion 31: `from_context: enclosing_function` resolves via line range containment
**Evidence:** `smallestContainingFunction(store.getNodesByFile(match.file), match.line)` finds nodes where `n.start_line <= line && (n.end_line ?? n.start_line) >= line`, then picks smallest span. Test `applyRuleMatches emits renders from smallest containing function` places match at line 6 inside `renderPanel:4-8` (not `App:1-12`), verifies renderPanel gets the edge, App does not.
**Verdict:** pass

### Criterion 32: Stage 3 outputs persisted in same graph store as existing pipeline
**Evidence:** `runAstGrepIndexStage(store, projectRoot, changedFiles)` receives the same `store` instance as the tree-sitter and LSP stages. Integration test uses a single `SqliteGraphStore` instance throughout all stages and reads back results from it.
**Verdict:** pass

### Criterion 33: indexing pipeline runs ast-grep Stage 3 after tree-sitter indexing
**Evidence:** In `src/indexer/pipeline.ts` line 101-105: tree-sitter loop completes, LSP runs, then `await runAstGrepIndexStage(store, projectRoot, changedFiles)` at line 105. AST-grep receives `changedFiles` populated during tree-sitter loop.
**Verdict:** pass

### Criterion 34: unit test covers impact classification matrix across all 4 change types
**Evidence:** `test/tool-impact.test.ts` test `collectImpact classification matrix (AC 34) across all change types` iterates `[signature_change, removal, behavior_change, addition]` and asserts expected classifications. All 125 tests pass.
**Verdict:** pass

### Criterion 35: unit test verifies impact respects maxDepth
**Evidence:** `test/tool-impact.test.ts` test `collectImpact respects maxDepth` calls with `maxDepth: 1` on a 2-hop chain; asserts only the depth-1 result is returned.
**Verdict:** pass

### Criterion 36: unit test verifies impact handles call-graph cycles without hanging
**Evidence:** Two cycle tests in `tool-impact.test.ts`: `collectImpact terminates on cycles without duplicates` (mutual 2-node cycle) and `collectImpact terminates on a 3-node cycle without duplicates`. Both complete (no timeout) and return correct unique sets.
**Verdict:** pass

### Criterion 37: unit test verifies rule loading merges bundled + project-local rules
**Evidence:** `indexer-ast-grep-rules.test.ts` test `loadRules merges bundled + project-local rules and accepts generic selectors` creates both a bundled dir and a `.codegraph/rules/` dir, asserts merged names `["express-route", "generic-context-template"]`.
**Verdict:** pass

### Criterion 38: unit test verifies rule validation fails on missing required fields
**Evidence:** Multiple tests in `indexer-ast-grep-rules.test.ts`: `loadRules enforces exactly one from_* and one to_* selector`, `loadRules rejects rules that specify both to_capture and to_template`, `loadRules rejects rules that specify neither from_capture nor from_context`, `loadRules rejects invalid from_context values with offending file path`, `loadRules wraps YAML parse errors with offending file path`. All verify thrown error messages include the offending file path.
**Verdict:** pass

### Criterion 39: unit test verifies match processing creates edges from fixture data without subprocess
**Evidence:** `test/indexer-ast-grep-express.test.ts` test `applyRuleMatches creates endpoint nodes and routes_to edges` and `test/indexer-ast-grep-react.test.ts` tests all call `applyRuleMatches(store, rule, matches)` with hand-crafted `SgMatch[]` arrays — no subprocess invocation. Tests pass.
**Verdict:** pass

### Criterion 40: integration test with Express fixture produces expected endpoint node and routes_to edge
**Evidence:** `test/indexer-ast-grep-express-integration.test.ts` test `pipeline Stage 3 minimal Express integration creates endpoint node id and routes_to edge` writes a real `api.ts` fixture, calls `indexProject`, asserts `store.getNode("endpoint:GET:/users")` is defined and `routes.map(r => r.node.id)` equals `["endpoint:GET:/users"]` with `provenance.source === "ast-grep"`. (Skips gracefully if `sg` binary absent.)
**Verdict:** pass

### Criterion 41: integration test with TSX React fixture produces expected renders edge
**Evidence:** `test/indexer-ast-grep-react-integration.test.ts` test `pipeline Stage 3 indexes same-file renders edges from TSX fixture` writes `App.tsx` + `Button.tsx`, calls `indexProject`, asserts `renders[0].node.name === "Button"` from `app` (the `App` function). (Skips if `sg` absent.)
**Verdict:** pass

### Criterion 42: integration test verifies stale ast-grep edges replaced on file change
**Evidence:** `test/indexer-ast-grep-express-integration.test.ts` test `pipeline Stage 3 indexes express routes, replaces changed matches, keeps unchanged reruns stable, and cleans removed-file artifacts`:
- First run: `endpoint:GET:/users` created.
- File changed to `/accounts` route, re-indexed: `endpoint:GET:/accounts` present, `endpoint:GET:/users` is null.
- Unchanged re-run: still exactly 1 routes_to edge, no duplicates.
- File deleted, re-indexed: no handler nodes, endpoint node null, routes_to empty.
All assertions pass (125/125).
**Verdict:** pass

---

## Overall Verdict

**pass**

All 42 acceptance criteria are satisfied. 125 tests pass across 31 files; 0 failures. TypeScript type check (`tsc --noEmit`) exits 0. No native ast-grep binding present. All impact classification logic, rule loading/validation, subprocess invocation, stale-edge cleanup, endpoint node creation, and anchored output are implemented and covered by both unit and integration tests.
