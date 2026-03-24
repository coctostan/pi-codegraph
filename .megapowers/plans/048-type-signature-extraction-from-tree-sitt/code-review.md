# Code Review: Type Signature Extraction from Tree-sitter AST

## Files Reviewed

- `src/graph/types.ts` — added `signature?: string` to `GraphNode` (+1 line)
- `src/graph/sqlite.ts` — migration, addNode, hydrateNode, all SELECT queries updated (+52/-48 lines)
- `src/indexer/tree-sitter.ts` — `addNode` helper updated, 3 new extraction helpers, all node handlers updated (+131/-14 lines)
- `test/indexer-extract-file.test.ts` — existing assertions updated to include `signature` field (+6 lines)
- `test/signature-schema.test.ts` — new: schema + migration tests
- `test/signature-round-trip.test.ts` — new: SQLite round-trip through all query paths
- `test/signature-extract-function.test.ts` — new: 6 function signature cases
- `test/signature-extract-arrow.test.ts` — new: 4 arrow function cases
- `test/signature-extract-class.test.ts` — new: 5 class signature cases
- `test/signature-extract-interface.test.ts` — new: 4 interface signature cases
- `test/signature-extract-generics.test.ts` — new: 4 generic type parameter cases
- `test/signature-extract-module.test.ts` — new: module node has no signature

## Strengths

- **Consistent migration pattern**: `src/graph/sqlite.ts:104-105` — follows the exact same `PRAGMA table_info` + `ALTER TABLE` pattern as the existing `is_exported` migration. Zero cognitive overhead for someone reading the code.
- **Clean conditional assignment**: `src/graph/sqlite.ts:130-132` and `src/indexer/tree-sitter.ts:55-57` — `signature` is only set on the object when non-null, so nodes without signatures don't carry the key. This satisfies AC 12 cleanly.
- **Surface syntax extraction**: `src/indexer/tree-sitter.ts:93,103` — using `text.replace(/^\s*:\s*/, "")` to strip the colon prefix from type annotations rather than deep AST traversal. Simple, correct, and matches the "surface syntax as written" requirement.
- **Generics included from the start**: `src/indexer/tree-sitter.ts:83-84` — type parameters extracted in `extractFunctionSignature` immediately, not as an afterthought.
- **Thorough test coverage**: 31 new tests across 8 files covering typed/untyped functions, arrow functions, generics, classes with/without constructors, interfaces with/without extends, module nodes, and full SQLite round-trips through every query path.

## Findings

### Critical

None.

### Important

**1. Duplicated parameter extraction logic**
- `src/indexer/tree-sitter.ts:86-100` (in `extractFunctionSignature`)
- `src/indexer/tree-sitter.ts:138-152` (in `extractClassSignature`)

These are 15 lines of near-identical logic (11/15 lines identical when normalized). The only difference is the variable name (`nameNode` vs `nameChild`). A shared `extractParamList(paramsNode: SyntaxNode): string` helper would eliminate the duplication and make both functions shorter.

**Why it matters:** When parameter extraction logic needs to change (e.g., rest params, destructured params, default values), it'll need to be changed in two places.

**Fix:** Extract a `formatParamList(params: SyntaxNode): string` helper that both functions call.

### Minor

**1. `fetchNeighborRows` duplicates `hydrateNode` logic**
- `src/graph/sqlite.ts:180-190` duplicates `src/graph/sqlite.ts:120-132`

This is a **pre-existing** duplication (existed before this issue). The new code just extended both spots consistently with `signature`. Not a regression, but noting it for future cleanup.

**2. `CREATE TABLE` DDL doesn't include `signature` column**
- `src/graph/sqlite.ts:47-56` — the initial schema definition lacks `signature`, so even brand-new databases get the column via `ALTER TABLE` migration.

This matches the existing `is_exported` pattern exactly, so it's consistent. Could be cleaner if both columns were in the DDL, but that's a broader refactor beyond this issue's scope.

## Recommendations

- Extract the param list formatting into a shared helper to eliminate the duplication (Important #1). This is a small, self-contained refactor.
- Consider a follow-up issue to add `is_exported` and `signature` to the initial `CREATE TABLE` DDL so new databases don't need migration for fields that have always existed.

## Assessment

**ready** — The code is correct, well-tested, follows existing patterns, and has no critical or blocking issues. The parameter extraction duplication (Important #1) is real but low-risk and can be addressed as a minor refactor without blocking the merge.
