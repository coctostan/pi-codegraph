---
id: 6
title: Add inline role tags to symbol_graph output
status: approved
depends_on:
  - 3
no_test: false
files_to_modify:
  - src/output/anchoring.ts
  - src/tools/symbol-graph.ts
files_to_create:
  - test/tool-symbol-graph-signals.test.ts
---

**Files:**
- Create: `test/tool-symbol-graph-signals.test.ts`
- Modify: `src/output/anchoring.ts`
- Modify: `src/tools/symbol-graph.ts`
- Test: `test/tool-symbol-graph-signals.test.ts`

**TDD Steps:**
1. Add a symbol graph test that asserts the resolved symbol header anchor line gets `[entry-point, tested]`-style tags and resolved neighbor lines get `[leaf, untested]`-style tags.
2. Run `bun test test/tool-symbol-graph-signals.test.ts` and confirm it fails because no inline tags are present.
3. Extend `AnchoredNeighbor` and `SymbolHeader` with an optional `signals` field in `src/output/anchoring.ts`, update the header/section renderers to append tags inline, then update `src/tools/symbol-graph.ts` to compute signals via the shared signal computer for the resolved symbol and resolved neighbors while leaving unresolved rows unchanged.
4. Re-run `bun test test/tool-symbol-graph-signals.test.ts` and expect PASS.
5. Run `bun test` and expect all passing.
