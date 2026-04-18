# Bugfix Summary: symbol_graph description implied an invalid include value

## Root Cause
The regression was at the agent-facing registration boundary, not in `symbolGraph()` execution.

Confirmed symbols and locations:
- `piCodegraph` — `src/index.ts:176`
- `symbolGraph` — `src/tools/symbol-graph.ts:171`
- `renderSymbolCardBody` — `src/tools/symbol-card.ts:49`

After the symbol lookup surface was unified onto `symbol_graph`, `piCodegraph` still registered a stale description and a generic `include` parameter description. The actual implementation never accepted `"tests"` as an include value:
- `symbolGraph()` only branches on `"neighborhood"`, `"contract"`, and `"source"`.
- `renderSymbolCardBody()` renders covering tests by default in the compact card when `tested_by` edges exist.

That left the public contract implying that `include: ["tests"]` was plausible even though validation rejected it before tool execution.

## Fix Approach
1. Updated the `SymbolGraphParams.include` schema description in `src/index.ts` to explicitly enumerate the only valid literals: `"neighborhood"`, `"contract"`, and `"source"`.
2. Updated the registered `symbol_graph` description in `piCodegraph()` to describe the real default output: a compact symbol summary with relationships, test signals, and key metadata.
3. Updated `README.md` to distinguish default compact-card content from optional include sections, and explicitly document that `"tests"` is not a valid include value.
4. Updated `docs/tool-descriptions.md` so the style guide and the registered surface use the same description language.
5. Strengthened regression tests to lock both the exact registered description and the include guidance.

## Files Changed
- `src/index.ts`
- `README.md`
- `docs/tool-descriptions.md`
- `test/extension-tool-descriptions.test.ts`
- `test/docs-symbol-graph-unified-surface.test.ts`

## How to Verify
### Reproduce the old symptom
```text
symbol_graph({ name: "symbolGraph", file: "src/tools/symbol-graph.ts", include: ["tests"] })
```
Expected result:
```text
Validation failed for tool "symbol_graph"
```
This rejection is still correct; the fix is that the schema/docs now state that `"tests"` is invalid and that test signals are part of the default card.

### Regression checks
```text
bun test
bun run check
```

Verified in this issue:
- `bun test` → `444 pass, 0 fail`
- `bun run check` → `tsc --noEmit`, exit 0

## Why This Fix Is Low Risk
No runtime graph traversal or rendering behavior changed. The fix is constrained to the registered surface contract, public documentation, and regression tests that keep the contract aligned with the implementation.
