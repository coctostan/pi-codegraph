---
id: 2
title: Emit a read() continuation hint from readSourceSnippet on truncation
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/output/source.ts
  - test/read-source-snippet.test.ts
  - test/tool-symbol-card-source.test.ts
files_to_create: []
---

**Files:**
- Modify: `src/output/source.ts` (the truncation-notice format string)
- Modify: `test/read-source-snippet.test.ts` (one stale literal assertion at line 124)

**Step 1 — Write the failing test**

Task 1 already authored the failing repro test (`test/repro-078-source-truncation-hint.test.ts`). The existing in-tree truncation snapshot at `test/read-source-snippet.test.ts:124` asserts the OLD literal `(15 more lines truncated)` — that assertion now contradicts the new contract and must be updated alongside the impl in this task.

The current shape of the existing test (lines 98–128 of `test/read-source-snippet.test.ts`):

```ts
test("readSourceSnippet truncates when source exceeds maxLines", () => {
  const projectRoot = join(tmpdir(), `pi-cg-src-trunc-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/a.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/a.ts::foo:1",
    kind: "function",
    name: "foo",
    file: "src/a.ts",
    start_line: 1,
    end_line: 20,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 5);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(15);
    expect(result!.text).toContain("line 1");
    expect(result!.text).toContain("line 5");
    expect(result!.text).not.toContain("|line 6");
    expect(result!.text).toContain("(15 more lines truncated)");   // ← line 124
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

Update line 124 (the `expect(result!.text).toContain("(15 more lines truncated)")` assertion) to assert the new contract:

```ts
    // Truncation notice now includes a read() continuation hint.
    expect(result!.text).toContain("15 more lines");
    expect(result!.text).toContain("src/a.ts");
    expect(result!.text).toMatch(/offset:\s*6\b/);
    expect(result!.text).toMatch(/limit:\s*15\b/);
    expect(result!.text).toMatch(/read\(/);
```

(First displayed line is 1, last displayed is 5, so first omitted line is 6 → `offset: 6`. 15 lines remain → `limit: 15`.)

Use a precise anchored edit. Read the file first, then replace the single line:

```
edit({
  path: "test/read-source-snippet.test.ts",
  edits: [{
    set_line: {
      anchor: "124:040|    expect(result!.text).toContain(\"(15 more lines truncated)\");",
      new_text: "    // Truncation notice now includes a read() continuation hint.\n    expect(result!.text).toContain(\"15 more lines\");\n    expect(result!.text).toContain(\"src/a.ts\");\n    expect(result!.text).toMatch(/offset:\\s*6\\b/);\n    expect(result!.text).toMatch(/limit:\\s*15\\b/);\n    expect(result!.text).toMatch(/read\\(/);"
    }
  }]
})
```

(Re-`read` the file immediately before editing to refresh the hashline anchor — the `124:040` hash is from the diagnosis snapshot and may have drifted.)

**Step 2 — Run test, verify it fails**

After updating the assertion (still no impl change), run:

Run: `bun test test/repro-078-source-truncation-hint.test.ts test/read-source-snippet.test.ts`

Expected: FAIL — both tests now fail because the production code still emits `(15 more lines truncated)` / `(50 more lines truncated)`. Bun prints (representative):

```
test/repro-078-source-truncation-hint.test.ts:
error: expect(received).toContain(expected)
Expected to contain: "src/big.ts"
Received: "...(50 more lines truncated)"
(fail) repro-078: truncated source includes read() continuation hint

test/read-source-snippet.test.ts:
error: expect(received).toContain(expected)
Expected to contain: "src/a.ts"
Received: "...(15 more lines truncated)"
(fail) readSourceSnippet truncates when source exceeds maxLines

 0 pass
 2 fail
```

This confirms RED is broad enough — both the new repro test and the updated snapshot test pin the new contract.

**Step 3 — Write minimal implementation**

Modify `src/output/source.ts` lines 52–55. Current code:

```ts
  let text = hashlined.join("\n");
  if (truncated > 0) {
    text += `\n(${truncated} more lines truncated)`;
  }
```

Replace with:

```ts
  let text = hashlined.join("\n");
  if (truncated > 0) {
    const nextOffset = node.start_line + displayLines.length;
    text += `\n(${truncated} more lines — use read("${node.file}", offset: ${nextOffset}, limit: ${truncated}) to see the rest)`;
  }
```

Notes on correctness:

- `displayLines.length === limit` whenever `truncated > 0` (line 44 ensures `slice(0, limit)`), so `node.start_line + displayLines.length` is the 1-indexed line number of the first omitted line. We use `displayLines.length` rather than `limit` for clarity (no ambiguity about which value is the "lines we showed").
- `truncated` is exactly the number of remaining lines and is a valid `limit` for `read()`.
- `node.file` is project-relative and ready to be quoted as the `read()` first arg, matching pi's `read` tool signature.
- Format does not include `## ` or other reserved trust-header prefixes (per diagnosis Risk Assessment mitigation).
- The literal substring `more lines` is preserved, so the loose assertion in `test/tool-symbol-card-source.test.ts:184` (`expect(output).toContain("more lines truncated)")`) — wait, that asserts `"more lines truncated)"` with the closing paren. That substring will NOT be in the new output. Need to handle that.

Re-verifying `test/tool-symbol-card-source.test.ts:184`:

```ts
    expect(output).toContain("more lines truncated)");
```

This asserts `"more lines truncated)"` — closing paren and "truncated" word. The new format is `(N more lines — use read(...) to see the rest)`, which does NOT contain `"more lines truncated)"`. So this assertion DOES break and must be updated in this task too.

Re-listing files to modify:

- `src/output/source.ts` — the fix
- `test/read-source-snippet.test.ts:124` — assertion update (above)
- `test/tool-symbol-card-source.test.ts:184` — assertion update: change to a substring guaranteed by the new format.

For `test/tool-symbol-card-source.test.ts:184`, replace:

```ts
    expect(output).toContain("more lines truncated)");
```

with:

```ts
    expect(output).toMatch(/\(\d+ more lines — use read\(/);
```

This asserts the new continuation hint appears in the symbol_card output without pinning exact line counts (the test sets up a 22-line function with `maxSourceLines: 3`, so 19 more lines).

Use anchored edits — read the file first, then replace using current hashline anchors. Don't trust the `184:12b` anchor from the diagnosis; refresh by reading.

**Files (final, after correction):**
- Modify: `src/output/source.ts`
- Modify: `test/read-source-snippet.test.ts`
- Modify: `test/tool-symbol-card-source.test.ts`

(Three files — at the documented limit of "≤3 files". This is one logical change: the truncation-notice format flipped from a bare count to a `read()` hint. The two existing tests assert the literal old phrase and must be re-pinned to the new phrase in the same task that emits it.)

**Step 4 — Run test, verify it passes**

Run: `bun test test/repro-078-source-truncation-hint.test.ts test/read-source-snippet.test.ts test/tool-symbol-card-source.test.ts`

Expected: PASS — all three test files green. Specifically:
- `repro-078: truncated source includes read() continuation hint` passes (4 assertions on the hint shape).
- `readSourceSnippet truncates when source exceeds maxLines` passes with the new assertions (`offset: 6`, `limit: 15`, `src/a.ts`, `read(`).
- `symbolCard truncates source when maxSourceLines is provided` passes via the regex `/\(\d+ more lines — use read\(/`.

Bun output:

```
✓ repro-078: truncated source includes read() continuation hint
✓ readSourceSnippet truncates when source exceeds maxLines
✓ symbolCard truncates source when maxSourceLines is provided
…
N pass, 0 fail
```

After this task: `tests_passed` signal.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: full suite green. Pay particular attention to:
- The four `test/extension-suppress-trust-header-*.test.ts` files (depth-4 `register` dependents per `impact readSourceSnippet`) — none of them assert snippet body, so they should remain unaffected.
- `test/tool-symbol-graph-source-include.test.ts` — exercises the `include: ["source"]` path through `symbolGraph` which routes via `renderSymbolSourceSection` → `readSourceSnippet`. If any assertion there pins the old truncation literal, treat that as a regression and update in this task.
- `test/typecheck.test.ts` — pure TS compile gate; should pass since the change is a string-format-only edit with no signature change.

If anything else fails, fix it here (likely another stale literal assertion missed during diagnosis).
