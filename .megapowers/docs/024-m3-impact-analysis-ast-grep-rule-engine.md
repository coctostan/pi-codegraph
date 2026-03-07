# M3: Impact Analysis & ast-grep Rule Engine

**Issue:** 024-m3-impact-analysis-ast-grep-rule-engine  
**Milestone:** M3  
**Source Issues:** #012 (`impact` tool), #013 (Stage 3 ast-grep indexer)  
**Status:** Complete — 125 tests pass, 0 failures

---

## What Was Built

### 1. `impact` Tool (`src/tools/impact.ts`)

The `impact` tool answers "what downstream code breaks or changes if this symbol is modified?" It traverses the inbound `calls` edge graph using BFS and classifies each reachable dependent by change type and depth:

| `changeType`       | depth 1      | depth > 1    |
|--------------------|--------------|--------------|
| `signature_change` | `breaking`   | `behavioral` |
| `removal`          | `breaking`   | `behavioral` |
| `behavior_change`  | `behavioral` | `behavioral` |
| `addition`         | *(no output)*| *(no output)*|

Output is hashline-anchored (`file:line:hash  name  classification  depth:N`) using the shared `computeAnchor` infrastructure. Cyclic call graphs terminate correctly via a `seen` set. The tool is registered in the pi extension (`src/index.ts`) with a JSON Schema describing `symbols`, `changeType`, and optional `maxDepth` parameters.

**Key exports:**
- `collectImpact(params)` — pure traversal/classification, returns `ImpactItem[]`
- `impact(params)` — anchored string output for tool response

### 2. TSX File Indexing (`src/indexer/tree-sitter.ts`, `src/indexer/pipeline.ts`)

The tree-sitter indexer now handles both `.ts` and `.tsx` files. `walkTsFiles()` was extended to include `.tsx`, and `typescriptLanguage(file)` selects the correct tree-sitter grammar (`tsx` vs `typescript`) based on file extension. This is a prerequisite for indexing React component files in Stage 3.

### 3. Stage 3 ast-grep Indexer (`src/indexer/ast-grep.ts`)

A new indexing stage that applies declarative YAML pattern rules against changed TypeScript/TSX files using the `sg` CLI subprocess (never a native binding). The stage runs after tree-sitter and LSP indexing in the pipeline.

**Architecture:**

```
loadRules()          → parses bundled + project-local YAML rules, validates all fields
runScan()            → invokes `sg run --json --lang <lang> --pattern <pattern> <files>`
applyRuleMatches()   → dispatches to applyRoutesToMatches() or applyRendersMatches()
runAstGrepIndexStage() → orchestrates rules × changed-files, called from indexProject()
```

**Rule format** (YAML array):
```yaml
- name: express-route
  pattern: $APP.$METHOD($PATH, $$$HANDLERS)
  lang: typescript
  produces:
    edge_kind: routes_to        # or: renders
    from_capture: HANDLERS      # or: from_context: enclosing_function
    to_template: endpoint:{METHOD}:{PATH}  # or: to_capture: COMPONENT
    confidence: 0.9
```

**Validation** enforces exactly one `from_*` and one `to_*` selector; invalid files throw with the offending file path.

### 4. Bundled Framework Rules (`src/rules/`)

**`express.yaml`** — Express route detection:
- Pattern: `$APP.$METHOD($PATH, $$$HANDLERS)`
- Creates an `endpoint` node with ID `endpoint:{METHOD}:{PATH}` (METHOD uppercased, PATH quote-stripped)
- Creates a `routes_to` edge from each handler function to the endpoint node

**`react.yaml`** — React self-closing JSX render detection:
- Pattern: `<$COMPONENT $$$ATTRS />`
- Resolves the enclosing function by finding the smallest line-range-containing function node in the same file
- Creates a `renders` edge from enclosing function to the matched component (same-file lookup only)

### 5. Graph Schema Extensions (`src/graph/types.ts`)

Added to the type system (already existed in the codebase from earlier type definitions — Stage 3 exercises them):
- `NodeKind`: `"endpoint"`
- `EdgeKind`: `"routes_to"`, `"renders"`
- `ProvenanceSource`: `"ast-grep"`

### 6. Incremental Correctness

Stage 3 only receives `changedFiles` from the pipeline. Stale ast-grep edges are removed via `store.deleteFile(rel)` (called in the pipeline before re-indexing) before Stage 3 re-scans. The `SqliteGraphStore` edge PRIMARY KEY `(source, target, kind, provenance_source)` prevents duplicate edges on unchanged re-runs.

---

## Why It Was Built

The symbol graph after M0–M2 could answer "who calls X" but not "what breaks if X changes." Agents needed a structured, traversal-based answer with severity classification — not just a flat neighbor list. Similarly, tree-sitter alone cannot see framework-level relationships: an Express `app.get('/users', handler)` call is syntactically a method call but semantically a route registration. The ast-grep rule engine makes these framework relationships first-class graph edges that agents can query.

---

## Files Changed

| File | Change |
|------|--------|
| `src/tools/impact.ts` | New — `collectImpact`, `impact` exports |
| `src/indexer/ast-grep.ts` | New — `loadRules`, `runScan`, `applyRuleMatches`, `runAstGrepIndexStage` |
| `src/rules/express.yaml` | New — bundled Express route rule |
| `src/rules/react.yaml` | New — bundled React render rule |
| `src/indexer/tree-sitter.ts` | Modified — TSX grammar selection |
| `src/indexer/pipeline.ts` | Modified — `walkTsFiles` includes `.tsx`; Stage 3 wired after LSP |
| `src/index.ts` | Modified — `impact` tool registered with `ImpactParams` schema |
| `test/tool-impact.test.ts` | New — 6 unit tests for classification, depth, cycles |
| `test/extension-impact.test.ts` | New — anchored output + tool registration tests |
| `test/indexer-tsx.test.ts` | New — TSX indexing prerequisite |
| `test/indexer-ast-grep-rules.test.ts` | New — 7 rule loading/validation tests |
| `test/indexer-ast-grep-scan.test.ts` | New — `runScan` subprocess interface tests |
| `test/indexer-ast-grep-express.test.ts` | New — `applyRuleMatches` unit tests for Express |
| `test/indexer-ast-grep-react.test.ts` | New — `applyRuleMatches` unit tests for React |
| `test/indexer-ast-grep-express-integration.test.ts` | New — Stage 3 Express pipeline integration |
| `test/indexer-ast-grep-react-integration.test.ts` | New — Stage 3 React pipeline integration |

---

## Test Coverage

```
bun test v1.3.9
 125 pass
 0 fail
 394 expect() calls
Ran 125 tests across 31 files. [4.54s]
```

All 42 acceptance criteria verified. TypeScript `tsc --noEmit` exits 0.
