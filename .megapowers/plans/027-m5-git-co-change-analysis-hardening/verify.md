# Verification Report: 027-m5-git-co-change-analysis-hardening

## Test Suite Results

```
bun test — 193 pass, 0 fail, 580 expect() calls
Ran 193 tests across 78 files. [5.45s]
```

All tests pass (run fresh, this session).

---

## Per-Criterion Verification

### Criterion 1: `src/indexer/git.ts` exports a function that parses `git log` output via spawned `git` CLI
**Evidence:** `src/indexer/git.ts` exists. `runGitCoChangeStage` is exported (line 75). It calls `execSync('git log --name-only --format="__COMMIT__%H %aI" --diff-filter=AMRT', ...)` at line 20-28 via `parseGitLog()`. No external npm dependency — uses `node:child_process`.
**Verdict:** pass

---

### Criterion 2: Co-change edges emitted as `module → module` with kind `co_changes_with` and provenance source `git`
**Evidence:** `src/indexer/git.ts` lines 135-147: `store.addEdge({ source: nodeA.id, target: nodeB.id, kind: "co_changes_with", provenance: { source: "git", ... } })`. nodeA/nodeB are module nodes obtained via `store.findNodes(fileA)`. Test `indexer-git-cochange.test.ts` asserts `abEdge.provenance_source === "git"` and `kind === "co_changes_with"`.
**Verdict:** pass

---

### Criterion 3: Commit age weighting applied with exponential decay using commit author date
**Evidence:** `src/indexer/git.ts` lines 57-61: `computeDecayWeight` returns `Math.pow(0.5, ageDays / halfLifeDays)`. `halfLifeDays = windowDays / 4` (line 103). Commit date parsed from `%aI` (author ISO date). Test `runGitCoChangeStage applies recency weighting (recent commits count more)` parses `recency_score` from evidence and asserts `> 0`.
**Verdict:** pass

---

### Criterion 4: Edge evidence includes co-change count, recency-weighted score, and time window
**Evidence:** `src/indexer/git.ts` line 133: `` `co_changes: ${data.count}, recency_score: ${data.weightedScore.toFixed(1)}, window: ${windowDays}d` ``. Test asserts `evidence.toContain("co_changes:")`, `evidence.toContain("recency_score:")`, `evidence.toContain("window:")`.
**Verdict:** pass

---

### Criterion 5: Configurable minimum co-change threshold (default ≥ 2)
**Evidence:** `src/indexer/git.ts` line 93: `const minCount = options.minCoChangeCount ?? 2;`. Line 126: `if (data.count < minCount) continue;`. Test creates one pair co-changing 2× (creates edge) and another co-changing 1× (no edge), using `minCoChangeCount: 2`.
**Verdict:** pass

---

### Criterion 6: Co-change stage wired into `pipeline.ts` as Stage 5 after coverage
**Evidence:** `src/indexer/pipeline.ts` line 9: `import { runGitCoChangeStage } from "./git.js"`. Lines 120-126: coverage stage runs first, then `const gitStart = performance.now(); await runGitCoChangeStage(store, projectRoot); timings["git"] = ...`. Test `indexer-pipeline-git-stage.test.ts` confirms `co_changes_with` edges appear after `indexProject`.
**Verdict:** pass

---

### Criterion 7: Incremental co-change indexing — skips on same HEAD, rebuilds on HEAD change
**Evidence:** `src/indexer/git.ts` lines 80-84: `const head = getCurrentHead(...)`. `const lastHead = store.getFileHash(GIT_HEAD_KEY)`. `if (lastHead === head) return;`. Lines 86-91: queries and deletes all existing `co_changes_with` edges with `provenance_source = 'git'` before rebuild. Line 149: `store.setFileHash(GIT_HEAD_KEY, head)` persists new HEAD after rebuild.
**Verdict:** pass

---

### Criterion 8: Non-git repo completes without error and without edges
**Evidence:** `src/indexer/git.ts` lines 63-73: `getCurrentHead` wraps `execSync("git rev-parse HEAD")` in try/catch, returns `null` on failure. Line 81: `if (!head) return;` — exits silently. Also lines 20-31: `parseGitLog` returns `[]` on any error.
**Verdict:** pass

---

### Criterion 9: Aliased imports extract original exported name; calls resolve to original
**Evidence:** `src/indexer/tree-sitter.ts` lines 226-229: `const aliasNode = spec.childForFieldName("alias"); if (aliasNode) { aliasToOriginal.set(aliasNode.text, originalName); }`. Line 325: `target: unresolvedId(aliasToOriginal.get(callee.text) ?? callee.text)`. Test `extractFile resolves aliased import calls to the original exported name` (line 160-178 in test file) passes: `h()` resolves to `::helper:`, not `::h:`.
**Verdict:** pass

---

### Criterion 10: Namespace imports extracted; qualified calls produce edges to the method name
**Evidence:** `src/indexer/tree-sitter.ts` lines 198-216: namespace import (`import * as X`) causes `namespaceImports.add(nsNameNode.text)` and an `imports` edge to `unresolvedId("*")`. Lines 336-353: member expression calls where `obj.text` is in `namespaceImports` emit `calls` edges targeting `prop.text`. Test `indexer-namespace-imports.test.ts` passes: `utils.helper()` → edge to `::helper:`, `utils.format()` → edge to `::format:`.
**Verdict:** pass

---

### Criterion 11: Re-exports create import edges from re-exporting module to source module's exported symbol
**Evidence:** `src/indexer/tree-sitter.ts` lines 248-278: `export_statement` with a `source` node triggers loop over `export_clause` → `export_specifier` nodes. `originalName = nameNode.text` (the exported name). Edge: `source: moduleNode.id, target: unresolvedId(originalName), kind: "imports"`. For `export { foo as baz } from "./bar"`, edge targets `foo` (original), not `baz`. Tests `extractFile extracts re-export with original name` and `extractFile extracts re-export with alias using original name` pass.
**Verdict:** pass

---

### Criterion 12: Barrel file awareness via re-export edges
**Evidence:** Test `extractFile extracts multiple re-exports from barrel file` (in `indexer-reexports.test.ts`) passes: `src/index.ts` with `export { alpha, beta } from "./math"; export { gamma } from "./science"` produces 3 import edges (alpha, beta, gamma). Re-export edges allow transitive resolution through the barrel.
**Verdict:** pass

---

### Criterion 13: Dynamic imports extracted with confidence 0.3
**Evidence:** `src/indexer/tree-sitter.ts` lines 149-172: `call_expression` where `fn.type === "import"` and first arg is string/template literal → edge with `confidence: 0.3`. Test `extractFile extracts dynamic import as low-confidence import edge` passes: `import("./heavy")` produces edge with `confidence: 0.3` and evidence containing `./heavy`. Non-string-literal arguments produce no edge (second test).
**Verdict:** pass

---

### Criterion 14: Each stage has wall-clock timing; pipeline returns `timings` structured data
**Evidence:** `src/indexer/pipeline.ts` lines 60-126: each stage (`tree-sitter`, `lsp`, `ast-grep`, `coverage`, `git`) wrapped in `performance.now()` start/end, stored in `timings` Record. `IndexResult` interface (line 18) has `timings: Record<string, number>`. Test `indexProject runs git co-change stage and returns timings` asserts all 5 keys exist and are non-negative numbers.
**Verdict:** pass

---

### Criterion 15: Pipeline return value includes summary counts (indexed, skipped, removed, errors)
**Evidence:** `src/indexer/pipeline.ts` lines 63-66 declare counters; line 128 returns `{ indexed, skipped, removed, errors, timings }`. Test `indexProject result shape remains backward-compatible for summary counts` asserts `result` matches `{ indexed: 1, skipped: 0, removed: 0, errors: 0 }`.
**Verdict:** pass

---

### Criterion 16: SQLite indexes cover `nodes(name)` and `edges(kind)`, existing indexes preserved
**Evidence:** `src/graph/sqlite.ts` lines 85-89:
```sql
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);      -- preserved
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source);   -- preserved
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target);   -- preserved
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);       -- new
CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);       -- new
```
All 5 indexes present.
**Verdict:** pass

---

### Criterion 17: `getStatistics()` added to `GraphStore` interface; returns node/edge/file counts
**Evidence:** `src/graph/store.ts` line 46: `getStatistics(projectRoot?: string): GraphStatistics;`. `GraphStatistics` interface (lines 24-28): `{ nodes: Record<string, number>; edges: Record<string, Record<string, number>>; files: { total: number; stale: number } }`. `SqliteGraphStore.getStatistics` implemented at sqlite.ts lines 210-239. Three tests in `graph-store-statistics.test.ts` cover node-by-kind, edge-by-kind+provenance, and file total counts — all pass.
**Verdict:** pass

---

### Criterion 18: Staleness detection: `getStatistics()` reports stale file count
**Evidence:** `src/graph/sqlite.ts` lines 225-236: when `projectRoot` is provided, iterates `file_hashes` rows, reads each file from disk, computes SHA-256, compares with stored hash. Mismatches (or read errors) increment `stale`. Test `graph-store-staleness.test.ts`: before file modification, `stale=0`; after modifying `a.ts`, `stale=1`. Also tests `stale=0` when no `projectRoot` provided. Both tests pass.
**Verdict:** pass

---

### Criterion 19: All existing tree-sitter tests pass; aliased import test updated to correct behavior
**Evidence:** Full test run: 193 pass, 0 fail. Test `extractFile resolves aliased import calls to the original exported name` exists at line 160 of `test/indexer-extract-file.test.ts` and passes — it asserts `h()` produces `::helper:` target and no `::h:` target. This is the updated behavior reflecting the correct implementation.
**Verdict:** pass

---

## Overall Verdict

**pass**

All 19 acceptance criteria are met. The implementation covers:
- Git co-change stage (AC 1-8): `src/indexer/git.ts` with exponential decay, configurable threshold, incremental HEAD-based caching, and graceful non-repo handling
- Tree-sitter hardening (AC 9-13): aliased imports, namespace imports, re-exports, barrel files, dynamic imports — all with passing tests
- Performance/observability (AC 14-18): stage timings in `IndexResult`, summary counts preserved, two new SQLite indexes, `getStatistics()` with staleness detection
- Regression safety (AC 19): 193/193 tests pass; aliased import test updated to assert correct behavior
