# Bugfix Summary — 085-trace-class-entry-point-descent-and-bett

## What changed
This bugfix repairs two `trace`-specific behavior gaps in `src/tools/trace.ts`.

1. **Class entry fallback**
   - `trace()` no longer renders class symbols like `SqliteGraphStore` or `BM25Index` as static leaf nodes.
   - When the resolved symbol is a `class`, `trace()` now removes the `leaf` role from the rendered line and emits a class-specific redirect:
     - use `symbol_graph` to inspect methods, or
     - trace a specific method symbol when available.

2. **Not-found and file-filter miss messaging**
   - `trace()` now uses `Symbol` instead of `Entry` for missing symbol output.
   - When a file-scoped lookup misses, `trace()` now retries `store.findNodes(name)` without the file filter and reports matching symbol locations instead of returning a generic not-found string.

## Root cause
Confirmed against the shipped symbol surfaces:

- `trace` — `src/tools/trace.ts:127:29b4`
  - Signature: `(params: TraceParams) => string`
- `resolveUniqueSymbol` — `src/tools/symbol-resolution.ts:20:a0c9`
  - Signature: `(params: { name: string; file?: string; store: GraphStore; projectRoot: string; notFoundLabel: string; }) => SymbolResolution`
- `extractFile` — `src/indexer/tree-sitter.ts:194:5229`
  - Signature: `(file: string, content: string) => ExtractionResult`

The underlying graph still models classes as atomic class nodes, while `trace()` static traversal only follows outgoing `calls` edges. That made class entries appear as `[leaf]` even when the source class clearly had behavior. Separately, `trace()` delegated not-found handling to `resolveUniqueSymbol()` with `notFoundLabel: "Entry"` and returned the zero-match result directly, which collapsed both true symbol misses and file-filter misses into the same misleading message.

## Fix approach
The fix stays local to `src/tools/trace.ts`.

- Added a class-specific branch before static DFS:
  - compute signals for the class node
  - remove the `leaf` role from the rendered tags
  - return a redirect note instead of pretending the class is a terminal trace step
- Split `ambiguous` and `not_found` handling:
  - ambiguity still passes through unchanged
  - missing symbols now use `Symbol "..." not found in the graph`
  - file-filter misses retry `store.findNodes(params.entry)` and render candidate file locations via `formatFileScopedMiss()`
- Left `src/tools/symbol-resolution.ts` untouched so `impact()` behavior stayed stable.

## Files changed
- `src/tools/trace.ts`
- `test/repro-079-trace-class-entry-point.test.ts`
- `test/repro-080-trace-not-found-message.test.ts`

## How to verify
### Targeted regressions
```bash
bun test test/repro-079-trace-class-entry-point.test.ts test/repro-080-trace-not-found-message.test.ts test/tool-trace-static-fallback.test.ts test/tool-trace-ambiguous.test.ts
```

### Full suite
```bash
bun test
```

### Expected behavior checks
- `trace({ entry: "SqliteGraphStore", file: "src/graph/sqlite.ts" })` emits a class-entry redirect and does not render `[leaf]`.
- `trace({ entry: "BM25Index", file: "src/tools/bm25.ts" })` emits the same redirect.
- `trace({ entry: "runPipeline" })` returns `Symbol "runPipeline" not found in the graph`.
- `trace({ entry: "walk", file: "src/does-not-exist.ts" })` reports real candidate locations instead of a generic not-found result.
- `trace({ entry: "walk" })` still returns the ambiguity list.

## Verification result
Verified in this session with:
- targeted regressions passing
- full suite passing (`404 pass, 0 fail`)
- direct repro outputs showing the old symptoms no longer occur
