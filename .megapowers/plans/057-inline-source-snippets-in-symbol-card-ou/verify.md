# Verification Report: Inline source snippets in symbol_card output

## Test Suite Results

```
387 pass
0 fail
1232 expect() calls
Ran 387 tests across 167 files. [8.39s]
```

All tests pass, including 13 new tests added for this feature.

## Per-Criterion Verification

### AC 1: `symbol_card` output includes `### Source` section after header/anchor and before Signature
**Evidence:** Test `symbolCard includes ### Source section with hashlined content` passes. Code inspection confirms Source section at lines 50-61 of `symbol-card.ts`, placed after header (line 47-48) and before Signature (line 63-66). Test asserts `sourceIdx < sigIdx`.
**Verdict:** pass

### AC 2: Source lines in hashline anchor format (`LINE:HASH|content`)
**Evidence:** Test `readSourceSnippet returns hashlined source for a valid node` asserts each line matches `/^\d+:[a-f0-9]+\|/`. Implementation at `source.ts:49` produces `${lineNum}:${lineHash}|${content}` using sha256 hash sliced to 4 chars — matches pi's `read` tool format.
**Verdict:** pass

### AC 3: `maxSourceLines` truncates with indicator
**Evidence:** Tests `readSourceSnippet truncates when source exceeds maxLines` and `symbolCard truncates source when maxSourceLines is provided` both pass. Implementation at `source.ts:43-55` truncates and appends `(N more lines truncated)`.
**Verdict:** pass

### AC 4: Default of 50 lines when `maxSourceLines` omitted
**Evidence:** Code inspection: `source.ts:6` defines `DEFAULT_MAX_SOURCE_LINES = 50`. Line 42: `const limit = maxLines ?? DEFAULT_MAX_SOURCE_LINES`.
**Verdict:** pass

### AC 5: Missing file → `source unavailable`
**Evidence:** Tests `readSourceSnippet returns null when file does not exist on disk` and `symbolCard Source section shows 'source unavailable' when file does not exist` both pass. Code: `source.ts:29` returns null, `symbol-card.ts:60` outputs "source unavailable".
**Verdict:** pass

### AC 6: `end_line` null → `source unavailable`
**Evidence:** Tests `readSourceSnippet returns null when end_line is null` and `symbolCard Source section shows 'source unavailable' when end_line is null` both pass. Code: `source.ts:26` returns null on `end_line == null`.
**Verdict:** pass

### AC 7: Stale marker `[stale]` on hash mismatch
**Evidence:** Tests `readSourceSnippet sets stale=true when content hash mismatches` and `symbolCard Source section header includes [stale] when content hash mismatches` both pass. Code: `source.ts:33` computes stale flag, `symbol-card.ts:55-56` sets header to `### Source [stale]`.
**Verdict:** pass

### AC 8: Neighbor signatures in Key Relationships
**Evidence:** Test `symbolCard shows neighbor signatures in Key Relationships` passes, asserting output contains `(x: number) => string` for neighbor `bar`. Code: `symbol-card.ts:122-124` adds `    ${nr.node.name}: ${nr.node.signature}` for each neighbor with a signature.
**Verdict:** pass

### AC 9: Limited to top-5-per-group, signature only
**Evidence:** Code inspection: `symbol-card.ts:116` slices to `neighbors.slice(0, 5)`. Lines 121-124 iterate only over `top` (the sliced array) and emit signature only, no source body.
**Verdict:** pass

### AC 10: No signature line for neighbors without stored signature
**Evidence:** Test `symbolCard omits signature line for neighbors without a signature` passes. Code: `symbol-card.ts:122` guards with `if (nr.node.signature)`.
**Verdict:** pass

### AC 11: Existing sections remain structurally unchanged
**Evidence:** Test `symbolCard renders full card with signature, relationships, and signals` (pre-existing happy path test) still passes. Code inspection confirms header, Signature, Exported, Covering Tests, Key Relationships, and Signals sections at same relative positions with identical formatting. Only additions: Source section and neighbor signature lines.
**Verdict:** pass

### AC 12: `SymbolCardParams` interface accepts optional `maxSourceLines`
**Evidence:** Code inspection: `symbol-card.ts:10` — `maxSourceLines?: number;` in the interface.
**Verdict:** pass

### AC 13: Typebox schema includes `maxSourceLines`
**Evidence:** `grep` output: `src/index.ts:74` — `maxSourceLines: Type.Optional(Type.Number({ description: "Maximum lines of source to inline (default: 50)" }))`. Line 314 passes it through to `symbolCard`.
**Verdict:** pass

### AC 14: `readSourceSnippet` utility extracted
**Evidence:** `src/output/source.ts` exists with exported function `readSourceSnippet(node: GraphNode, projectRoot: string, maxLines?: number): SourceSnippetResult | null`. Uses `node:fs` only — no new dependencies. 6 tests cover it directly.
**Verdict:** pass

## Overall Verdict

**pass** — All 14 acceptance criteria verified with test evidence and code inspection. 387 tests pass with 0 failures.
