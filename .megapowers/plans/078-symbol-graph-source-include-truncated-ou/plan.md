# Plan

### Task 1: Lock the failing repro test as the RED contract for the new truncation-hint format

**Files:**
- Modify (already exists from reproduce phase): `test/repro-078-source-truncation-hint.test.ts`

The reproduce phase already authored `test/repro-078-source-truncation-hint.test.ts`. This task adopts it as the canonical RED test for the new contract — no rewrite needed; just confirm it exists with the four loose assertions the spec requires (file path present, `offset: 51`, `limit: 50`, `read(`) and that it currently fails against `src/output/source.ts` HEAD.

**Step 1 — Write the failing test**

The test was lifted from `readSourceSnippet`'s current signature in `src/output/source.ts:21–25`:

```ts
export function readSourceSnippet(
  node: GraphNode,
  projectRoot: string,
  maxLines?: number,
): SourceSnippetResult | null
```

Confirm the file matches this canonical content. If it has drifted (e.g. been edited during diagnose), restore it verbatim:

```ts
// Reproduction for issue #078 — symbol_graph source include: truncated
// output gives no token count or continuation path.
//
// Acceptance: when readSourceSnippet truncates the body, the trailing
// notice must include a read() hint pointing at the first omitted line
// (file path + offset + limit) so the agent can fetch the rest in one
// follow-up call.

import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSourceSnippet } from "../src/output/source.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";
import type { GraphNode } from "../src/graph/types.js";

test("repro-078: truncated source includes read() continuation hint", () => {
  const projectRoot = join(tmpdir(), `pi-cg-repro-078-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  // 100-line function body. With the default maxLines of 50, we expect
  // 50 lines truncated and a hint pointing at line 51.
  const lines = Array.from({ length: 100 }, (_, i) => `  // line ${i + 1}`);
  const fileContent = lines.join("\n") + "\n";
  writeFileSync(join(projectRoot, "src/big.ts"), fileContent);
  const hash = sha256Hex(fileContent);

  const node: GraphNode = {
    id: "src/big.ts::big:1",
    kind: "function",
    name: "big",
    file: "src/big.ts",
    start_line: 1,
    end_line: 100,
    content_hash: hash,
  };

  try {
    const result = readSourceSnippet(node, projectRoot, 50);
    expect(result).not.toBeNull();
    expect(result!.truncated).toBe(50);

    // Bug: today the truncation notice is the bare string
    //   "(50 more lines truncated)"
    // and the agent has no way to read the remaining 50 lines without
    // a separate symbol lookup. The fix should emit a single-line hint
    // referencing the file path, the offset of the first omitted line,
    // and the count to read.

    // The hint must reference the file path so the agent can call read directly.
    expect(result!.text).toContain("src/big.ts");

    // The hint must reference the first omitted line as an offset.
    // First displayed line is 1, last displayed is 50, so first omitted is 51.
    expect(result!.text).toMatch(/offset:\s*51\b/);

    // The hint must indicate how many more lines remain.
    expect(result!.text).toMatch(/limit:\s*50\b/);

    // And it should be expressed as a read() call so the agent can copy/paste it.
    expect(result!.text).toMatch(/read\(/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

The four `expect` assertions on `result!.text` are deliberately loose (no exact phrasing) — Task 2 picks the final wording, and these assertions will continue to hold as long as the hint contains the file path, `offset:`, `limit:`, and `read(`.

**Step 2 — Run test, verify it fails**

Run: `bun test test/repro-078-source-truncation-hint.test.ts`

Expected: FAIL — Bun prints:

```
error: expect(received).toContain(expected)

Expected to contain: "src/big.ts"
Received: "1:cb8f|  // line 1\n…\n50:a0d9|  // line 50\n(50 more lines truncated)"

      at .../test/repro-078-source-truncation-hint.test.ts:51:26
(fail) repro-078: truncated source includes read() continuation hint
 0 pass
 1 fail
```

(Verified during reproduce — see `.megapowers/plans/078-symbol-graph-source-include-truncated-ou/reproduce.md` Evidence section.)

**Step 3 — Write minimal implementation**

Implementation deferred to Task 2 — this task only locks the failing test as the contract.

**Step 4 — Run test, verify it passes**

Skip — passing comes from Task 2.

**Step 5 — Verify no regressions**

Run: `bun test`

Expected: 1 pre-existing failure on `test/repro-078-source-truncation-hint.test.ts`; all other tests pass. The test/read-source-snippet.test.ts:124 assertion `(15 more lines truncated)` still passes (current impl still produces that phrase).

After this task: `tests_failed` signal — RED is recorded for issue #078.

### Task 2: Emit a read() continuation hint from readSourceSnippet on truncation [depends: 1]

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

### Task 3: Update the maxSourceLines doc to describe the new continuation hint [no-test] [depends: 2]

**Justification:** Documentation-only change. Updates the public description of `maxSourceLines` in the M9 feature doc to reflect the new continuation hint emitted by Task 2. No observable behavior — the running code's truncation format is already covered by the test updates in Task 2.

**Files:**
- Modify: `.megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md`

**Step 1 — Make the change**

The current doc at line 21 reads:

```
21:b32|`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a `(N more lines truncated)` indicator.
```

Replace it with (preserving surrounding `### New parameter` heading and the blank line at 22):

```
`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a single-line continuation hint pointing back at the source file, e.g. `(50 more lines — use read("src/big.ts", offset: 51, limit: 50) to see the rest)`. The hint references the file path, the 1-indexed offset of the first omitted line, and the remaining line count, so an agent can read the rest in one follow-up `read()` call without a second symbol lookup.
```

Use an anchored edit — re-`read` the file immediately before editing to refresh the line-21 hashline (the `21:b32` shown in the diagnosis is from a prior snapshot and may have drifted):

```
read({ path: ".megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md", offset: 19, limit: 5 })
edit({
  path: ".megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md",
  edits: [{
    set_line: {
      anchor: "<refreshed line 21 anchor>",
      new_text: "`maxSourceLines` (optional number, default 50) — controls how many lines of the target symbol's source are included. Excess lines are truncated with a single-line continuation hint pointing back at the source file, e.g. `(50 more lines — use read(\"src/big.ts\", offset: 51, limit: 50) to see the rest)`. The hint references the file path, the 1-indexed offset of the first omitted line, and the remaining line count, so an agent can read the rest in one follow-up `read()` call without a second symbol lookup."
    }
  }]
})
```

**Step 2 — Verify**

Run: `bash -lc 'grep -n "more lines truncated" .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md'`

Expected: no matches (exit code 1) — the obsolete literal phrase is gone from the doc.

Then run: `bash -lc 'grep -n "use read(" .megapowers/docs/057-inline-source-snippets-in-symbol-card-ou.md'`

Expected: one match on or near line 21 — the new continuation-hint example is present.

Final sanity: `bun test` once more to confirm nothing else regresses (the doc is not consumed by code, but cheap to re-run and closes the issue's "full suite green" criterion #7).

Expected: full suite green, including the three tests modified in Task 2.
