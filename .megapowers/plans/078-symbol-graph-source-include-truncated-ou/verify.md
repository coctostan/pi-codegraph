# Verify — Issue #078

## Test Suite Results

```
$ bun test
…
 402 pass
 0 fail
 1178 expect() calls
Ran 402 tests across 163 files. [12.65s]
```

Targeted re-run of every consumer of `readSourceSnippet`:

```
$ bun test test/read-source-snippet.test.ts test/tool-symbol-card-source.test.ts test/tool-symbol-graph-source-include.test.ts
 17 pass
 0 fail
 65 expect() calls
Ran 17 tests across 3 files. [57.00ms]
```

`grep -rn readSourceSnippet src test` shows the symbol is consumed at exactly one production site (`src/tools/symbol-card.ts:41`, inside `renderSymbolSourceSection`) and three test files (all run above). The `impact` tool reported `indexing-failed` for this run, so coverage was confirmed via grep instead.

## Reproduction of Original Symptom

The repro test from the diagnose phase deterministically reproduced the bug at HEAD pre-fix (`Received: "...50:a0d9|  // line 50\n(50 more lines truncated)"`). After the fix:

```
$ bun test test/repro-078-source-truncation-hint.test.ts
test/repro-078-source-truncation-hint.test.ts:
(pass) repro-078: truncated source includes read() continuation hint [1.17ms]
 1 pass
 0 fail
 6 expect() calls
```

Symptom no longer occurs — the truncation notice now contains `src/big.ts`, `offset: 51`, `limit: 50`, and the literal `read(`.

## Per-Criterion Verification

### Criterion 1: `readSourceSnippet` truncation suffix contains `node.file`, `offset:` of first omitted line, and `limit:` equal to `truncated`

**Evidence:** `src/output/source.ts:54–55`:

```
54:43f|    const nextOffset = node.start_line + displayLines.length;
55:863|    text += `\n(${truncated} more lines — use read("${node.file}", offset: ${nextOffset}, limit: ${truncated}) to see the rest)`;
```

`nextOffset = node.start_line + displayLines.length` is the 1-indexed first omitted line (since `displayLines = sourceLines.slice(0, limit)` when truncated > 0). Repro test asserts all three values for a 100-line node with `maxLines = 50`: `expect(result!.text).toContain("src/big.ts")`, `toMatch(/offset:\s*51\b/)`, `toMatch(/limit:\s*50\b/)` — all pass.

**Verdict:** pass

### Criterion 2: Truncation suffix is a single line containing a `read(...)` invocation

**Evidence:** Source line 55 emits exactly one `\n` followed by `(${truncated} more lines — use read("${node.file}", offset: ${nextOffset}, limit: ${truncated}) to see the rest)` — single line, contains `read(`. Repro test asserts `toMatch(/read\(/)` — passes. Form matches the example in the diagnosis: `(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)`.

**Verdict:** pass

### Criterion 3: Non-truncated output is byte-identical to today

**Evidence:** The new code only adds the suffix inside `if (truncated > 0)` (line 53). When `truncated === 0`, the function returns `hashlined.join("\n")` exactly as before. The pre-existing `test/read-source-snippet.test.ts` tests for non-truncated paths all pass:

```
(pass) readSourceSnippet returns hashlined source for a valid node [0.72ms]
(pass) readSourceSnippet returns null when file does not exist on disk [0.46ms]
(pass) readSourceSnippet returns null when end_line is null [0.52ms]
(pass) readSourceSnippet sets stale=true when content hash mismatches [0.55ms]
(pass) readSourceSnippet sets stale=false when content hash matches [0.46ms]
```

**Verdict:** pass

### Criterion 4: New `test/repro-078-source-truncation-hint.test.ts` passes

**Evidence:** See "Reproduction" section above — file exists, all 4 hint assertions plus the `truncated === 50` and `not.toBeNull()` assertions (6 total) pass.

**Verdict:** pass

### Criterion 5: Existing assertions on the truncation phrase updated to the new format

**Evidence:**
- `test/read-source-snippet.test.ts:124`+ now asserts `15 more lines`, `src/a.ts`, `offset: 6`, `limit: 15`, `read(` — passes (`readSourceSnippet truncates when source exceeds maxLines`).
- `test/tool-symbol-card-source.test.ts:184` updated to `expect(output).toMatch(/\(\d+ more lines — use read\(/)` — passes (`symbolCard truncates source when maxSourceLines is provided`).

**Verdict:** pass

### Criterion 6: `.megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md:21` updated

**Evidence:**

```
$ grep -n "more lines truncated\|use read(" .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md
21:`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a single-line continuation hint pointing back at the source file, e.g. `(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)`. …
```

Obsolete `more lines truncated` phrase is gone; new continuation-hint example is present at line 21.

**Verdict:** pass

### Criterion 7: Full `bun test` suite green

**Evidence:** `bun test` → 402 pass / 0 fail / 1178 expect() calls across 163 files (output above). The four `test/extension-suppress-trust-header-*` tests and `test/tool-symbol-graph-source-include.test.ts` all pass.

**Verdict:** pass

## Overall Verdict

**pass** — all 7 acceptance criteria met. The bug is fixed at its single root site (`src/output/source.ts:53–56`), the regression test from the reproduce phase is now green, two stale literal assertions in the existing test suite were re-pinned to the new contract, the M9 doc was updated, and the full 402-test suite is green with no regressions.
