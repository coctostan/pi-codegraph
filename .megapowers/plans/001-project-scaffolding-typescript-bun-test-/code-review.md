# Code Review: 001-project-scaffolding-typescript-bun-test-

## Files Reviewed

| File | Description |
|------|-------------|
| `package.json` | Project manifest — name, type, scripts, pi.extensions, devDeps |
| `tsconfig.json` | Compiler config — strict, ESNext, moduleResolution bundler, bun types |
| `src/index.ts` | pi extension entrypoint — typed default export |
| `src/graph/types.ts` | Placeholder interfaces: GraphNode, GraphEdge, Provenance |
| `src/graph/store.ts` | Empty GraphStore interface |
| `src/graph/sqlite.ts` | Empty SqliteGraphStore class implementing GraphStore |
| `src/indexer/pipeline.ts` | Placeholder IndexPipeline function |
| `src/indexer/tree-sitter.ts` | Placeholder treeSitterIndex function |
| `src/tools/symbol-graph.ts` | Placeholder symbolGraph function |
| `src/tools/resolve-edge.ts` | Placeholder resolveEdge function |
| `src/output/anchoring.ts` | Placeholder anchorResults function |
| `src/rules/.gitkeep` | Empty sentinel keeping the directory tracked |
| `test/smoke.test.ts` | Smoke test — imports entrypoint, asserts default is a function |
| `test/graph-types.typecheck.ts` | Compile-time type assignment checks for all 3 placeholder types |
| `test/graph-store.test.ts` | Runtime import + instanceof check for GraphStore/SqliteGraphStore |
| `test/indexer-placeholders.test.ts` | Runtime typeof checks for IndexPipeline and treeSitterIndex |
| `test/tool-placeholders.test.ts` | Runtime typeof checks for symbolGraph and resolveEdge |
| `test/output-anchoring.test.ts` | Runtime typeof check for anchorResults + existsSync("src/rules") |

---

## Strengths

- **`src/graph/sqlite.ts:3`** — `SqliteGraphStore implements GraphStore` is exactly right for a scaffold. It means future method additions to `GraphStore` will immediately surface as type errors in `SqliteGraphStore`, preventing the interface and implementation drifting silently.
- **`tsconfig.json:5`** — `"moduleResolution": "bundler"` is the correct Bun-idiomatic choice; paired with `"module": "ESNext"`, it avoids CJS shim overhead and keeps imports honest.
- **`test/graph-types.typecheck.ts`** — Using a `.ts` typecheck file (picked up by `tsc --noEmit` but not by `bun test`) is a clean pattern for compile-time assertions without runtime overhead. All three placeholder interfaces are exercised with real values, not just type imports.
- **`test/output-anchoring.test.ts:8`** — Combining the module export check with `existsSync("src/rules")` in a single test is appropriate here; both are directly related to the same task scope (output + rules directory).
- **`package.json`** — `"private": true` is correctly set; no accidental npm publish risk.

---

## Findings

### Critical
None.

### Important
None.

### Minor

**`test/smoke.test.ts:2`** — The comment `// smoke test for extension entrypoint` was inserted mid-file between the import and the `describe` block. It reads slightly awkwardly sitting between the import line and the test body. Not wrong, but a top-of-file or pre-describe placement would be more conventional. No functional impact.

**`src/graph/types.ts` — `GraphEdge` is missing `Provenance` link.** AGENTS.md states "Edges carry provenance (source, confidence, evidence, content hash)." The `GraphEdge` placeholder currently has no relation to `Provenance`. This is intentional for M0 scaffolding (no business logic), but worth noting so M1 planning picks this up. The Provenance interface itself exists and is correct as a standalone placeholder.

**`test/output-anchoring.test.ts:8`** — `existsSync("src/rules")` uses a relative path resolved from the process working directory. This will pass when run from the repo root (standard `bun test` invocation) but would silently fail if the test runner is ever invoked from a different directory. Using `new URL("../../src/rules", import.meta.url)` or `path.join(import.meta.dir, "../../src/rules")` would be more robust. Minor for now since the project is Bun-only and `bun test` always runs from the project root.

---

## Recommendations

- When M1 adds real methods to `GraphStore`, consider whether `SqliteGraphStore` should stay in the same file or move to its own module. At scaffold size it's fine together; at implementation size a separate file per class is cleaner.
- `test/graph-types.typecheck.ts` is compiled by `tsc` but not executed by `bun test` (no `test()`/`describe()` calls). This is intentional and correct. Keep the convention consistent going forward — compile-time files use `.typecheck.ts`, runtime tests use `.test.ts`.

---

## Assessment
**ready**

This is a scaffolding issue — all files are intentional stubs with zero business logic. The code is minimal, correctly typed, consistent with AGENTS.md's described layout, and all 16 acceptance criteria pass. No critical or important findings. The one minor note about `existsSync` path robustness and the misplaced comment are not worth a blocking fix at this stage.
